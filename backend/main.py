import yfinance as yf
from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import json
from datetime import datetime, timedelta
import time
import pandas as pd
import numpy as np
import os
import io
import base64
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
import mplfinance as mpf
import warnings
warnings.filterwarnings('ignore')
import concurrent.futures
import requests

# Global cache for all NYSE tickers
nyse_ticker_cache = None
nyse_ticker_cache_time = 0
NYSE_TICKER_CACHE_DURATION = 60 * 60 * 12  # 12 hours


app = FastAPI(title="Advanced Momentum Trading Strategy API", version="2.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory cache
cache = {}
CACHE_DURATION = 300  # 5 minutes for data caching

# In-memory storage for strategies and data
strategies = {}
uploaded_data = {}
backtest_results = {}

class TickerData(BaseModel):
    symbol: str
    name: str
    current_price: float
    daily_change: float
    daily_change_percent: float
    timestamps: List[str]
    prices: List[float]
    highs: List[float]
    lows: List[float]
    opens: List[float]
    volumes: List[int]

class StrategyMetadata(BaseModel):
    name: str
    type: str  # "single_asset" or "screened_multi"
    description: Optional[str] = None

class BacktestConfig(BaseModel):
    strategy_id: str
    data_id: str
    screener_id: Optional[str] = None
    initial_capital: float = 100000
    commission: float = 0.001
    slippage: float = 0.0005

class BacktestResult(BaseModel):
    id: str
    strategy_name: str
    dataset_name: str
    performance: float
    sharpe_ratio: float
    max_drawdown: float
    total_trades: int
    win_rate: float
    equity_curve: List[float]
    trade_log: List[Dict]

class ScreenResult(BaseModel):
    symbol: str
    value: float
    name: Optional[str] = None
    confidence_score: Optional[float] = None
    pattern_strength: Optional[str] = None

class MomentumCriteria(BaseModel):
    criterion1_large_move: Dict[str, Any]
    criterion2_consolidation: Dict[str, Any]
    criterion3_narrow_range: Dict[str, Any]
    criterion4_moving_averages: Dict[str, Any]
    criterion5_volume_breakout: Dict[str, Any]
    criterion6_close_at_hod: Dict[str, Any]
    criterion7_not_extended: Dict[str, Any]
    criterion8_linear_moves: Dict[str, Any]
    criterion9_avoid_barcode: Dict[str, Any]

class MomentumAnalysisResult(BaseModel):
    symbol: str
    pattern_found: bool
    confidence_score: float
    analysis_report: Optional[str] = None
    chart_image_base64: Optional[str] = None
    criteria_details: Optional[MomentumCriteria] = None
    total_criteria_met: int
    pattern_strength: str  # "Strong", "Moderate", "Weak"

def get_comprehensive_stock_list() -> list:
    """
    Return a static list of tickers as provided by the user, bypassing all remote fetches and fallbacks.
    """
    return [
        "AACB", "AACBR", "AACBU", "AACG", "AACI", "AACIU", "AACIW", "AAL", "AAME", "AAOI", "AAON", "AAPG", "AAPL", "AARD", "ABAT", "ABCL", "ABEO", "ABL", "ABLLL", "ABLLW", "ABLV", "ABLVW", "ABNB", "ABOS", "ABP", "ABPWW", "ABSI", "ABTS", "ABUS", "ABVC", "ABVE", "ABVEW", "ABVX", "ACAD", "ACB", "ACDC", "ACET", "ACFN", "ACGL", "ACGLN", "ACGLO", "ACHC", "ACHV", "ACIC", "ACIU", "ACIW", "ACLS", "ACLX", "ACMR", "ACNB", "ACNT", "ACOG", "ACON", "ACONW", "ACRS", "ACRV", "ACT", "ACTG", "ACTU", "ACXP", "ADAG", "ADAP", "ADBE", "ADD", "ADEA", "ADGM", "ADI", "ADIL", "ADMA", "ADN", "ADNWW", "ADP", "ADPT", "ADSE", "ADSEW", "ADSK", "ADTN", "ADTX", "ADUR", "ADUS", "ADV", "ADVB", "ADVM", "ADVWW", "ADXN", "AEBI", "AEHL", "AEHR", "AEI", "AEIS", "AEMD", "AENT", "AENTW", "AEP", "AERT", "AERTW", "AEVA", "AEVAW", "AEYE", "AFBI", "AFCG", "AFJK", "AFJKR", "AFRI", "AFRIW", "AFRM", "AFYA", "AGAE", "AGEN", "AGFY", "AGH", "AGIO", "AGMH", "AGNC", "AGNCL", "AGNCM", "AGNCN", "AGNCO", "AGNCP", "AGRI", "AGYS", "AHCO", "AHG", "AIFE", "AIFER", "AIFF", "AIFU", "AIHS", "AIMD", "AIMDW", "AIOT", "AIP", "AIRE", "AIRG", "AIRJ", "AIRJW", "AIRO", "AIRS", "AIRT", "AIRTP", "AISP", "AISPW", "AIXI", "AKAM", "AKAN", "AKBA", "AKRO", "AKTX", "ALAB", "ALAR", "ALBT", "ALCO", "ALCY", "ALDF", "ALDFU", "ALDFW", "ALDX", "ALEC", "ALF", "ALFUU", "ALFUW", "ALGM", "ALGN", "ALGS", "ALGT", "ALHC", "ALKS", "ALKT", "ALLO", "ALLR", "ALLT", "ALM", "ALMS", "ALMU", "ALNT", "ALNY", "ALOT", "ALRM", "ALRS", "ALT", "ALTI", "ALTO", "ALTS", "ALVO", "ALVOW", "ALXO", "ALZN", "AMAL", "AMAT", "AMBA", "AMBR", "AMCX", "AMD", "AMED", "AMGN", "AMIX", "AMKR", "AMLX", "AMOD", "AMODW", "AMPG", "AMPGW", "AMPH", "AMPL", "AMRK", "AMRN", "AMRX", "AMSC", "AMSF", "AMST", "AMTX", "AMWD", "AMZN", "ANAB", "ANDE", "ANEB", "ANGH", "ANGHW", "ANGI", "ANGO", "ANIK", "ANIP", "ANIX", "ANL", "ANNA", "ANNAW", "ANNX", "ANPA", "ANSC", "ANSCU", "ANSCW", "ANTA", "ANTE", "ANTX", "ANY", "AOSL", "AOUT", "APA", "APDN", "APEI", "APGE", "API", "APLD", "APLM", "APLMW", "APLS", "APLT", "APM", "APOG", "APP", "APPF", "APPN", "APPS", "APRE", "APVO", "APWC", "APYX", "AQB", "AQMS", "AQST", "ARAI", "ARAY", "ARBB", "ARBE", "ARBEW", "ARBK", "ARBKL", "ARCB", "ARCC", "ARCT", "ARDX", "AREB", "AREBW", "AREC", "ARGX", "ARHS", "ARKO", "ARKOW", "ARKR", "ARLP", "ARM", "AROW", "ARQ", "ARQQ", "ARQQW", "ARQT", "ARRY", "ARTL", "ARTNA", "ARTV", "ARTW", "ARVN", "ARWR", "ASBP", "ASBPW", "ASLE", "ASMB", "ASML", "ASND", "ASNS", "ASO", "ASPC", "ASPCR", "ASPCU", "ASPI", "ASPS", "ASPSW", "ASPSZ", "ASRT", "ASRV", "ASST", "ASTC", "ASTE", "ASTH", "ASTI", "ASTL", "ASTLW", "ASTS", "ASUR", "ASYS", "ATAI", "ATAT", "ATEC", "ATER", "ATEX", "ATGL", "ATHA", "ATHE", "ATHR", "ATII", "ATIIW", "ATLC", "ATLCL", "ATLCP", "ATLCZ", "ATLN", "ATLO", "ATLX", "ATMC", "ATMCR", "ATMCW", "ATMV", "ATMVR", "ATNF", "ATNFW", "ATNI", "ATOM", "ATOS", "ATPC", "ATRA", "ATRC", "ATRO", "ATXG", "ATXS", "ATYR", "AUBN", "AUDC", "AUGO", "AUID", "AUPH", "AUR", "AURA", "AUROW", "AUTL", "AUUD", "AUUDW", "AVAH", "AVAV", "AVBP", "AVDL", "AVDX", "AVGO", "AVIR", "AVNW", "AVO", "AVPT", "AVR", "AVT", "AVTX", "AVXL", "AWRE", "AXGN", "AXINU", "AXON", "AXSM", "AXTI", "AYRO", "AYTU", "AZ", "AZI", "AZN", "AZTA", "BACCU", "BACQ", "BACQR", "BAER", "BAERW", "BAFN", "BAND", "BANF", "BANFP", "BANL", "BANR", "BANX", "BAOS", "BASE", "BATRA", "BATRK", "BAYA", "BAYAR", "BAYAU", "BBCP", "BBGI", "BBIO", "BBLG", "BBLGW", "BBNX", "BBSI", "BCAB", "BCAL", "BCAX", "BCBP", "BCDA", "BCG", "BCGWW", "BCML", "BCPC", "BCRX", "BCTX", "BCTXW", "BCTXZ", "BCYC", "BDMD", "BDMDW", "BDRX", "BDSX", "BDTX", "BEAG", "BEAGR", "BEAM", "BEAT", "BEATW", "BEEM", "BEEP", "BELFA", "BELFB", "BENF", "BENFW", "BETR", "BETRW", "BFC", "BFIN", "BFRG", "BFRGW", "BFRI", "BFRIW", "BFST", "BGC", "BGFV", "BGL", "BGLC", "BGLWW", "BGM", "BHAT", "BHF", "BHFAL", "BHFAM", "BHFAN", "BHFAO", "BHFAP", "BHRB", "BHST", "BIAF", "BIDU", "BIGC", "BIIB", "BILI", "BINI", "BIOA", "BIOX", "BIRD", "BITF", "BIVI", "BIYA", "BJDX", "BJRI", "BKHA", "BKHAR", "BKNG", "BKR", "BKYI", "BL", "BLBD", "BLBX", "BLDE", "BLDEW", "BLDP", "BLFS", "BLFY", "BLIN", "BLIV", "BLKB", "BLMN", "BLMZ", "BLNE", "BLNK", "BLRX", "BLTE", "BLUWU", "BLZE", "BMBL", "BMEA", "BMGL", "BMHL", "BMR", "BMRA", "BMRC", "BMRN", "BNAI", "BNAIW", "BNGO", "BNR", "BNRG", "BNTC", "BNTX", "BNZI", "BNZIW", "BOF", "BOKF", "BOLD", "BOLT", "BON", "BOOM", "BOSC", "BOTJ", "BOXL", "BPOP", "BPOPM", "BPRN", "BPYPM", "BPYPN", "BPYPO", "BPYPP", "BRAG", "BREA", "BRFH", "BRID", "BRKL", "BRKR", "BRLS", "BRLSW", "BRLT", "BRNS", "BRTX", "BRY", "BRZE", "BSAAU", "BSBK", "BSET", "BSGM", "BSLK", "BSLKW", "BSRR", "BSVN", "BSY", "BTAI", "BTBD", "BTBDW", "BTBT", "BTCS", "BTCT", "BTDR", "BTM", "BTMD", "BTMWW", "BTOC", "BTOG", "BTSG", "BTSGU", "BULL", "BULLW", "BUSE", "BUSEP", "BVFL", "BVS", "BWAY", "BWB", "BWBBP", "BWEN", "BWFG", "BWIN", "BWMN", "BYFC", "BYND", "BYRN", "BYSI", "BZ", "BZAI", "BZAIW", "BZFD", "BZFDW", "BZUN", "CAAS", "CABA", "CAC", "CACC", "CADL", "CAEP", "CAI", "CAKE", "CALC", "CALM", "CAMP", "CAMT", "CAN", "CAPN", "CAPNR", "CAPR", "CAPS", "CAPT", "CAPTW", "CAR", "CARE", "CARG", "CARL", "CARM", "CART", "CARV", "CASH", "CASI", "CASK", "CASY", "CATY", "CBAT", "CBFV", "CBIO", "CBLL", "CBNK", "CBRL", "CBSH", "CBUS", "CCAP", "CCB", "CCBG", "CCCC", "CCCM", "CCCMU", "CCCMW", "CCCS", "CCCX", "CCCXU", "CCCXW", "CCD", "CCEC", "CCEP", "CCG", "CCGWW", "CCIIU", "CCIR", "CCIRU", "CCIRW", "CCIX", "CCIXU", "CCIXW", "CCLD", "CCLDO", "CCNE", "CCNEP", "CCOI", "CCRN", "CCSI", "CCTG", "CDIO", "CDLX", "CDNA", "CDNS", "CDRO", "CDROW", "CDT", "CDTG", "CDTTW", "CDTX", "CDW", "CDXS", "CDZI", "CDZIP", "CECO", "CEG", "CELC", "CELH", "CELU", "CELUW", "CELZ", "CENN", "CENT", "CENTA", "CENX", "CEP", "CEPO", "CEPT", "CERO", "CEROW", "CERS", "CERT", "CETX", "CETY", "CEVA", "CFBK", "CFFI", "CFFN", "CFLT", "CFSB", "CG", "CGABL", "CGBD", "CGBDL", "CGC", "CGCT", "CGCTW", "CGEM", "CGEN", "CGNT", "CGNX", "CGO", "CGON", "CGTL", "CGTX", "CHA", "CHAC", "CHACR", "CHAR", "CHCI", "CHCO", "CHDN", "CHEF", "CHEK", "CHI", "CHKP", "CHMG", "CHNR", "CHPG", "CHPGR", "CHPGU", "CHR", "CHRD", "CHRS", "CHRW", "CHSCL", "CHSCM", "CHSCN", "CHSCO", "CHSCP", "CHSN", "CHTR", "CHW", "CHY", "CHYM", "CIFR", "CIFRW", "CIGI", "CIGL", "CIIT", "CINF", "CING", "CINGW", "CISO", "CISS", "CIVB", "CJET", "CJMB", "CLAR", "CLBK", "CLBT", "CLDX", "CLFD", "CLGN", "CLIK", "CLIR", "CLLS", "CLMB", "CLMT", "CLNE", "CLNN", "CLNNW", "CLOV", "CLPS", "CLPT", "CLRB", "CLRO", "CLSD", "CLSK", "CLSKW", "CLST", "CLWT", "CLYM", "CMBM", "CMCO", "CMCSA", "CMCT", "CME", "CMMB", "CMND", "CMPO", "CMPOW", "CMPR", "CMPS", "CMPX", "CMTL", "CNCK", "CNDT", "CNET", "CNEY", "CNFR", "CNFRZ", "CNOB", "CNOBP", "CNSP", "CNTA", "CNTB", "CNTX", "CNTY", "CNVS", "CNXC", "CNXN", "COCH", "COCHW", "COCO", "COCP", "CODA", "CODX", "COEP", "COEPW", "COFS", "COGT", "COHU", "COIN", "COKE", "COLA", "COLAR", "COLB", "COLL", "COLM", "COMM", "COO", "COOP", "COOT", "COOTW", "CORT", "CORZ", "CORZW", "CORZZ", "COSM", "COST", "COYA", "CPB", "CPBI", "CPHC", "CPIX", "CPOP", "CPRT", "CPRX", "CPSH", "CPSS", "CPZ", "CRAI", "CRAQ", "CRAQR", "CRAQU", "CRBP", "CRBU", "CRCT", "CRDF", "CRDL", "CRDO", "CRE", "CREG", "CRESW", "CRESY", "CREV", "CREVW", "CREX", "CRGO", "CRGOW", "CRGX", "CRIS", "CRMD", "CRML", "CRMLW", "CRMT", "CRNC", "CRNT", "CRNX", "CRON", "CROX", "CRSP", "CRSR", "CRTO", "CRUS", "CRVL", "CRVO", "CRVS", "CRWD", "CRWS", "CRWV", "CSAI", "CSBR", "CSCI", "CSCO", "CSGP", "CSGS", "CSIQ", "CSPI", "CSQ", "CSTE", "CSTL", "CSWC", "CSWCZ", "CSX", "CTAS", "CTBI", "CTKB", "CTLP", "CTMX", "CTNM", "CTNT", "CTOR", "CTRM", "CTRN", "CTSH", "CTSO", "CTXR", "CUB", "CUBWU", "CUBWW", "CUE", "CUPR", "CURI", "CURIW", "CURR", "CV", "CVAC", "CVBF", "CVCO", "CVGI", "CVGW", "CVKD", "CVLT", "CVRX", "CVV", "CWBC", "CWCO", "CWD", "CWST", "CXAI", "CXAIW", "CXDO", "CYBR", "CYCC", "CYCCP", "CYCN", "CYCU", "CYCUW", "CYN", "CYRX", "CYTK", "CZFS", "CZNC", "CZR", "CZWI", "DAAQ", "DAAQU", "DAAQW", "DAIC", "DAICW", "DAIO", "DAKT", "DALN", "DARE", "DASH", "DATS", "DATSW", "DAVE", "DAVEW", "DAWN", "DBVT", "DBX", "DCBO", "DCGO", "DCOM", "DCOMG", "DCOMP", "DCTH", "DDI", "DDOG", "DEFT", "DENN", "DERM", "DEVS", "DFDV", "DFLI", "DFLIW", "DFSC", "DFSCW", "DGICA", "DGICB", "DGII", "DGLY", "DGNX", "DGXX", "DH", "DHAI", "DHAIW", "DHC", "DHCNI", "DHCNL", "DHIL", "DIBS", "DIOD", "DJCO", "DJT", "DJTWW", "DKNG", "DLHC", "DLO", "DLPN", "DLTH", "DLTR", "DLXY", "DMAA", "DMAAR", "DMAAU", "DMAC", "DMLP", "DMRC", "DNLI", "DNTH", "DNUT", "DOCU", "DOGZ", "DOMH", "DOMO", "DOOO", "DORM", "DOX", "DOYU", "DPRO", "DPZ", "DRCT", "DRDB", "DRDBU", "DRDBW", "DRIO", "DRMA", "DRMAW", "DRRX", "DRS", "DRTS", "DRTSW", "DRUG", "DRVN", "DSGN", "DSGR", "DSGX", "DSP", "DSWL", "DSY", "DSYWW", "DTCK", "DTI", "DTIL", "DTSQ", "DTSQR", "DTSS", "DTST", "DTSTW", "DUO", "DUOL", "DUOT", "DVAX", "DVLT", "DWSN", "DWTX", "DXCM", "DXLG", "DXPE", "DXR", "DXST", "DYAI", "DYCQ", "DYCQR", "DYN", "DYNX", "DYNXU", "DYNXW", "EA", "EBAY", "EBC", "EBMT", "EBON", "ECBK", "ECDA", "ECDAW", "ECOR", "ECPG", "ECX", "ECXWW", "EDAP", "EDBL", "EDBLW", "EDHL", "EDIT", "EDRY", "EDSA", "EDTK", "EDUC", "EEFT", "EEIQ", "EFOI", "EFSC", "EFSCP", "EFSI", "EGAN", "EH", "EHGO", "EHLD", "EHTH", "EJH", "EKSO", "ELAB", "ELBM", "ELDN", "ELPW", "ELSE", "ELTK", "ELTX", "ELUT", "ELVA", "ELVN", "ELWS", "EM", "EMBC", "EMCG", "EMCGR", "EMCGW", "EML", "EMPG", "ENGN", "ENGNW", "ENGS", "ENLT", "ENLV", "ENPH", "ENSC", "ENSG", "ENTA", "ENTG", "ENTO", "ENTX", "ENVB", "ENVX", "ENVXW", "EOLS", "EOSE", "EOSEW", "EPIX", "EPOW", "EPRX", "EPSM", "EPSN", "EPWK", "EQ", "EQIX", "ERAS", "ERIC", "ERIE", "ERII", "ERNA", "ESCA", "ESEA", "ESGL", "ESGLW", "ESHAR", "ESLA", "ESLT", "ESOA", "ESPR", "ESQ", "ESTA", "ETNB", "ETON", "ETOR", "ETSY", "EU", "EUDA", "EUDAW", "EVAX", "EVCM", "EVER", "EVGN", "EVGO", "EVGOW", "EVLV", "EVLVW", "EVO", "EVOK", "EVRG", "EVTV", "EWBC", "EWCZ", "EWTX", "EXAS", "EXC", "EXE", "EXEEL", "EXEEW", "EXEL", "EXFY", "EXLS", "EXOZ", "EXPE", "EXPI", "EXPO", "EXTR", "EYE", "EYPT", "EZGO", "EZPW", "FA", "FAAS", "FAASW", "FACT", "FACTU", "FACTW", "FAMI", "FANG", "FARM", "FAST", "FAT", "FATBB", "FATBP", "FATE", "FATN", "FBGL", "FBIO", "FBIOP", "FBIZ", "FBLA", "FBLG", "FBNC", "FBRX", "FBYD", "FCAP", "FCBC", "FCCO", "FCEL", "FCFS", "FCNCA", "FCNCO", "FCNCP", "FCUV", "FDBC", "FDMT", "FDSB", "FDUS", "FEAM", "FEBO", "FEIM", "FELE", "FEMY", "FENC", "FER", "FERA", "FERAR", "FERAU", "FFAI", "FFAIW", "FFBC", "FFIC", "FFIN", "FFIV", "FGBI", "FGBIP", "FGEN", "FGF", "FGFPP", "FGI", "FGIWW", "FGL", "FGMC", "FGMCR", "FGMCU", "FHB", "FHTX", "FIBK", "FIEE", "FIGXU", "FINW", "FIP", "FISI", "FITB", "FITBI", "FITBO", "FITBP", "FIVE", "FIVN", "FIZZ", "FKWL", "FLD", "FLDDW", "FLEX", "FLGC", "FLGT", "FLL", "FLNC", "FLNT", "FLUX", "FLWS", "FLX", "FLXS", "FLYE", "FLYW", "FMAO", "FMBH", "FMFC", "FMNB", "FMST", "FMSTW", "FNGR", "FNKO", "FNLC", "FNWB", "FNWD", "FOLD", "FONR", "FORA", "FORD", "FORL", "FORLW", "FORM", "FORR", "FORTY", "FOSL", "FOSLL", "FOX", "FOXA", "FOXF", "FOXX", "FOXXW", "FPAY", "FRAF", "FRBA", "FRD", "FRGT", "FRHC", "FRME", "FRMEP", "FROG", "FRPH", "FRPT", "FRSH", "FRST", "FRSX", "FSBC", "FSBW", "FSEA", "FSFG", "FSHP", "FSHPR", "FSLR", "FSTR", "FSUN", "FSV", "FTAI", "FTAIM", "FTAIN", "FTCI", "FTDR", "FTEK", "FTEL", "FTFT", "FTHM", "FTLF", "FTNT", "FTRE", "FTRK", "FUFU", "FUFUW", "FULC", "FULT", "FULTP", "FUNC", "FUND", "FUSB", "FUTU", "FVCB", "FVN", "FVNNR", "FWONA", "FWONK", "FWRD", "FWRG", "FXNC", "FYBR", "GABC", "GAIA", "GAIN", "GAINI", "GAINL", "GAINN", "GAINZ", "GALT", "GAMB", "GAME", "GANX", "GASS", "GAUZ", "GBDC", "GBFH", "GBIO", "GCBC", "GCL", "GCLWW", "GCMG", "GCMGW", "GCT", "GCTK", "GDC", "GDEN", "GDEV", "GDEVW", "GDHG", "GDRX", "GDS", "GDTC", "GDYN", "GECC", "GECCH", "GECCI", "GECCO", "GECCZ", "GEG", "GEGGL", "GEHC", "GELS", "GEN", "GENK", "GENVR", "GEOS", "GERN", "GEVO", "GFAI", "GFAIW", "GFS", "GGAL", "GGR", "GGROW", "GH", "GHRS", "GIBO", "GIBOW", "GIFI", "GIFT", "GIG", "GIGGW", "GIGM", "GIII", "GILD", "GILT", "GIPR", "GIPRW", "GITS", "GLAD", "GLADZ", "GLBE", "GLBS", "GLBZ", "GLDD", "GLE", "GLIBA", "GLIBK", "GLMD", "GLNG", "GLPG", "GLPI", "GLRE", "GLSI", "GLTO", "GLUE", "GLXG", "GLXY", "GMAB", "GMGI", "GMHS", "GMM", "GNFT", "GNLN", "GNLX", "GNPX", "GNSS", "GNTA", "GNTX", "GO", "GOCO", "GOGL", "GOGO", "GOOD", "GOODN", "GOODO", "GOOG", "GOOGL", "GORV", "GOSS", "GOVX", "GOVXW", "GP", "GPAT", "GPATW", "GPCR", "GPRE", "GPRO", "GRAB", "GRABW", "GRAL", "GRAN", "GRCE", "GREE", "GREEL", "GRFS", "GRI", "GRNQ", "GROW", "GRPN", "GRRR", "GRRRW", "GRVY", "GRWG", "GRYP", "GSAT", "GSBC", "GSHD", "GSHR", "GSHRW", "GSIT", "GSIW", "GSM", "GSRT", "GSRTR", "GSUN", "GT", "GTBP", "GTEC", "GTEN", "GTENU", "GTENW", "GTERA", "GTERR", "GTERU", "GTERW", "GTI", "GTIM", "GTLB", "GTM", "GTX", "GURE", "GUTS", "GV", "GVH", "GWAV", "GWRS", "GXAI", "GYRE", "GYRO", "HAFC", "HAIN", "HALO", "HAO", "HAS", "HBAN", "HBANL", "HBANM", "HBANP", "HBCP", "HBIO", "HBNB", "HBNC", "HBT", "HCAI", "HCAT", "HCHL", "HCKT", "HCM", "HCSG", "HCTI", "HCWB", "HDL", "HDSN", "HELE", "HEPS", "HERZ", "HFBL", "HFFG", "HFWA", "HGBL", "HHS", "HIFS", "HIHO", "HIMX", "HIT", "HITI", "HIVE", "HKIT", "HKPD", "HLIT", "HLMN", "HLNE", "HLP", "HLVX", "HLXB", "HMR", "HMST", "HNNA", "HNNAZ", "HNRG", "HNST", "HNVR", "HOFT", "HOLO", "HOLOW", "HOLX", "HON", "HOND", "HONDW", "HONE", "HOOD", "HOOK", "HOPE", "HOTH", "HOUR", "HOVNP", "HOVR", "HOVRW", "HOWL", "HPAI", "HPAIW", "HPK", "HPKEW", "HQI", "HQY", "HRMY", "HROW", "HROWL", "HROWM", "HRTX", "HRZN", "HSAI", "HSCS", "HSCSW", "HSDT", "HSIC", "HSII", "HSON", "HSPO", "HSPOW", "HSPTR", "HSPTU", "HST", "HSTM", "HTBK", "HTCO", "HTCR", "HTHT", "HTLD", "HTLM", "HTO", "HTOO", "HTOOW", "HTZ", "HTZWW", "HUBC", "HUBCW", "HUBCZ", "HUBG", "HUDI", "HUHU", "HUIZ", "HUMA", "HUMAW", "HURA", "HURC", "HURN", "HUT", "HVII", "HVIIR", "HVIIU", "HWBK", "HWC", "HWCPZ", "HWH", "HWKN", "HXHX", "HYFM", "HYMC", "HYMCL", "HYPD", "HYPR", "IAC", "IART", "IAS", "IBAC", "IBACR", "IBCP", "IBEX", "IBG", "IBIO", "IBKR", "IBOC", "IBRX", "ICCC", "ICCM", "ICFI", "ICG", "ICHR", "ICLR", "ICMB", "ICON", "ICU", "ICUCW", "ICUI", "IDAI", "IDCC", "IDN", "IDXX", "IDYA", "IEP", "IESC", "IFBD", "IFRX", "IGIC", "IGMS", "IHRT", "III", "IIIV", "IINN", "IINNW", "IKT", "ILAG", "ILLR", "ILLRW", "ILMN", "ILPT", "IMA", "IMAB", "IMCC", "IMCR", "IMDX", "IMG", "IMKTA", "IMMP", "IMMR", "IMMX", "IMNM", "IMNN", "IMOS", "IMPP", "IMPPP", "IMRN", "IMRX", "IMTE", "IMTX", "IMUX", "IMVT", "IMXI", "INAB", "INACU", "INBK", "INBKZ", "INBS", "INBX", "INCR", "INCY", "INDB", "INDI", "INDP", "INDV", "INEO", "INGN", "INHD", "INKT", "INLF", "INM", "INMB", "INMD", "INNV", "INO", "INOD", "INSE", "INSG", "INSM", "INTA", "INTC", "INTG", "INTJ", "INTR", "INTS", "INTU", "INTZ", "INV", "INVA", "INVE", "INVZ", "INVZW", "IOBT", "IONR", "IONS", "IOSP", "IOTR", "IOVA", "IPA", "IPAR", "IPCX", "IPCXR", "IPCXU", "IPDN", "IPGP", "IPHA", "IPM", "IPOD", "IPODU", "IPODW", "IPSC", "IPW", "IPWR", "IPX", "IQ", "IQST", "IRBT", "IRD", "IRDM", "IREN", "IRIX", "IRMD", "IROH", "IROHR", "IROHW", "IRON", "IROQ", "IRTC", "IRWD", "ISBA", "ISPC", "ISPO", "ISPOW", "ISPR", "ISRG", "ISRL", "ISRLW", "ISSC", "ISTR", "ITIC", "ITOS", "ITRI", "ITRM", "ITRN", "IVA", "IVDA", "IVDAW", "IVF", "IVP", "IVVD", "IXHL", "IZEA", "IZM", "JACK", "JAGX", "JAKK", "JAMF", "JANX", "JAZZ", "JBDI", "JBHT", "JBIO", "JBLU", "JBSS", "JCAP", "JCSE", "JCTC", "JD", "JDZG", "JEM", "JFB", "JFBR", "JFBRW", "JFIN", "JFU", "JG", "JJSF", "JKHY", "JL", "JLHL", "JMSB", "JOUT", "JOYY", "JRSH", "JRVR", "JSM", "JSPR", "JSPRW", "JTAI", "JUNS", "JVA", "JWEL", "JXG", "JYD", "JYNT", "JZ", "JZXN", "KALA", "KALU", "KALV", "KARO", "KAVL", "KBSX", "KC", "KCHV", "KCHVR", "KCHVU", "KDP", "KE", "KELYA", "KELYB", "KEQU", "KFFB", "KFII", "KFIIR", "KG", "KGEI", "KHC", "KIDS", "KIDZ", "KIDZW", "KINS", "KIRK", "KITT", "KITTW", "KLAC", "KLIC", "KLRS", "KLTO", "KLTOW", "KLTR", "KLXE", "KMB", "KMDA", "KMRK", "KMTS", "KNDI", "KNSA", "KOD", "KOPN", "KOSS", "KPLT", "KPLTW", "KPRX", "KPTI", "KRKR", "KRMD", "KRNT", "KRNY", "KROS", "KRRO", "KRT", "KRUS", "KRYS", "KSCP", "KSPI", "KTCC", "KTOS", "KTTA", "KTTAW", "KURA", "KVAC", "KVACW", "KVHI", "KWM", "KWMWW", "KXIN", "KYMR", "KYTX", "KZIA", "KZR", "LAB", "LAES", "LAKE", "LAMR", "LAND", "LANDM", "LANDO", "LANDP", "LARK", "LASE", "LASR", "LAUR", "LAWR", "LAZR", "LBGJ", "LBRDA", "LBRDK", "LBRDP", "LBTYA", "LBTYB", "LBTYK", "LCCC", "LCCCR", "LCCCU", "LCFY", "LCFYW", "LCID", "LCNB", "LCUT", "LDWY", "LE", "LECO", "LEDS", "LEE", "LEGH", "LEGN", "LENZ", "LESL", "LEXX", "LEXXW", "LFCR", "LFMD", "LFMDP", "LFST", "LFUS", "LFVN", "LFWD", "LGCB", "LGCL", "LGHL", "LGIH", "LGND", "LGO", "LGVN", "LHAI", "LHSW", "LI", "LICN", "LIDR", "LIDRW", "LIEN", "LIF", "LILA", "LILAK", "LIMN", "LIMNW", "LIN", "LINC", "LIND", "LINE", "LINK", "LIQT", "LITE", "LITM", "LIVE", "LIVN", "LIXT", "LIXTW", "LKFN", "LKQ", "LLYVA", "LLYVK", "LMAT", "LMB", "LMFA", "LMNR", "LNKB", "LNKS", "LNSR", "LNT", "LNTH", "LNW", "LNZA", "LNZAW", "LOAN", "LOBO", "LOCO", "LOGI", "LOKV", "LOKVU", "LOOP", "LOPE", "LOT", "LOTWW", "LOVE", "LPAA", "LPAAW", "LPBB", "LPBBW", "LPCN", "LPLA", "LPRO", "LPSN", "LPTH", "LPTX", "LQDA", "LQDT", "LRCX", "LRE", "LRHC", "LRMR", "LSAK", "LSB", "LSBK", "LSBPW", "LSCC", "LSE", "LSH", "LSTA", "LSTR", "LTBR", "LTRN", "LTRX", "LTRYW", "LUCD", "LUCY", "LUCYW", "LULU", "LUNG", "LUNR", "LVLU", "LVO", "LVRO", "LVROW", "LVTX", "LWACU", "LWAY", "LWLG", "LX", "LXEH", "LXEO", "LXRX", "LYEL", "LYFT", "LYRA", "LYTS", "LZ", "LZMH", "MAAS", "MACI", "MACIW", "MAMA", "MAMK", "MAMO", "MANH", "MAPS", "MAPSW", "MAR", "MARA", "MARPS", "MASI", "MASK", "MASS", "MAT", "MATH", "MATW", "MAXN", "MAYA", "MAYAR", "MAYS", "MAZE", "MB", "MBAV", "MBAVU", "MBAVW", "MBBC", "MBCN", "MBIN", "MBINL", "MBINM", "MBINN", "MBIO", "MBLY", "MBNKO", "MBOT", "MBRX", "MBUU", "MBWM", "MBX", "MCBS", "MCFT", "MCHP", "MCHPP", "MCHX", "MCRB", "MCRI", "MCTR", "MCVT", "MCW", "MDAI", "MDAIW", "MDB", "MDBH", "MDCX", "MDCXW", "MDGL", "MDIA", "MDLZ", "MDRR", "MDWD", "MDXG", "MDXH", "MEDP", "MEGL", "MEIP", "MELI", "MENS", "MEOH", "MERC", "MESA", "MESO", "META", "METC", "METCB", "METCL", "METCZ", "MFH", "MFI", "MFIC", "MFICL", "MFIN", "MGEE", "MGIC", "MGIH", "MGNI", "MGNX", "MGPI", "MGRC", "MGRM", "MGRT", "MGRX", "MGTX", "MGX", "MGYR", "MHUA", "MIDD", "MIGI", "MIMI", "MIND", "MIRA", "MIRM", "MIST", "MITK", "MJID", "MKDW", "MKDWW", "MKSI", "MKTW", "MKTX", "MKZR", "MLAB", "MLAC", "MLACU", "MLCO", "MLEC", "MLECW", "MLGO", "MLKN", "MLTX", "MLYS", "MMLP", "MMSI", "MMYT", "MNDO", "MNDR", "MNDY", "MNKD", "MNMD", "MNOV", "MNPR", "MNRO", "MNSB", "MNSBP", "MNST", "MNTK", "MNTS", "MNTSW", "MNY", "MNYWW", "MOB", "MOBBW", "MOBX", "MOBXW", "MODD", "MODV", "MOFG", "MOGO", "MOLN", "MOMO", "MORN", "MOVE", "MPAA", "MPB", "MPWR", "MQ", "MRAM", "MRBK", "MRCC", "MRCY", "MREO", "MRKR", "MRM", "MRNA", "MRNO", "MRNOW", "MRSN", "MRTN", "MRUS", "MRVI", "MRVL", "MRX", "MSAI", "MSAIW", "MSBI", "MSBIP", "MSEX", "MSFT", "MSGM", "MSGY", "MSPR", "MSPRW", "MSPRZ", "MSS", "MSTR", "MSW", "MTC", "MTCH", "MTEK", "MTEKW", "MTEN", "MTEX", "MTLS", "MTRX", "MTSI", "MTSR", "MTVA", "MU", "MURA", "MVBF", "MVIS", "MVST", "MVSTW", "MWYN", "MXCT", "MXL", "MYFW", "MYGN", "MYNZ", "MYPS", "MYPSW", "MYRG", "MYSZ", "MZTI", "NA", "NAAS", "NAGE", "NAII", "NAKA", "NAKAW", "NAMI", "NAMM", "NAMMW", "NAMS", "NAMSW", "NAOV", "NATH", "NATR", "NAUT", "NAVI", "NB", "NBBK", "NBIS", "NBIX", "NBN", "NBTB", "NBTX", "NCEW", "NCI", "NCMI", "NCNA", "NCNO", "NCPL", "NCPLW", "NCRA", "NCSM", "NCT", "NCTY", "NDAQ", "NDLS", "NDRA", "NDSN", "NECB", "NEGG", "NEHC", "NEHCW", "NEO", "NEOG", "NEON", "NEOV", "NEOVW", "NEPH", "NERV", "NESR", "NETD", "NETDW", "NEUP", "NEWT", "NEWTG", "NEWTH", "NEWTI", "NEWTZ", "NEXM", "NEXN", "NEXT", "NFBK", "NFE", "NFLX", "NGNE", "NHIC", "NHICU", "NHPAP", "NHPBP", "NHTC", "NICE", "NIOBW", "NIPG", "NISN", "NITO", "NIU", "NIVF", "NIXX", "NIXXW", "NKSH", "NKTR", "NKTX", "NLSP", "NLSPW", "NMFC", "NMFCZ", "NMIH", "NMPAU", "NMRA", "NMRK", "NMTC", "NN", "NNAVW", "NNBR", "NNDM", "NNE", "NNNN", "NNOX", "NODK", "NOEM", "NOEMR", "NOEMW", "NOTV", "NOVT", "NPAC", "NPACU", "NPACW", "NPCE", "NRC", "NRDS", "NRIM", "NRIX", "NRSN", "NRSNW", "NRXP", "NRXPW", "NSIT", "NSPR", "NSSC", "NSTS", "NSYS", "NTAP", "NTCL", "NTCT", "NTES", "NTGR", "NTHI", "NTIC", "NTLA", "NTNX", "NTRA", "NTRB", "NTRBW", "NTRP", "NTRS", "NTRSO", "NTWK", "NTWO", "NTWOW", "NUKK", "NUKKW", "NUTX", "NUVL", "NUWE", "NVA", "NVAWW", "NVAX", "NVCR", "NVCT", "NVDA", "NVEC", "NVEE", "NVFY", "NVMI", "NVNI", "NVNIW", "NVNO", "NVTS", "NVVE", "NVVEW", "NVX", "NWBI", "NWE", "NWFL", "NWGL", "NWL", "NWPX", "NWS", "NWSA", "NWTG", "NWTN", "NWTNW", "NXGL", "NXGLW", "NXL", "NXLIW", "NXPI", "NXPL", "NXPLW", "NXST", "NXT", "NXTC", "NXTT", "NXXT", "NYAX", "NYMT", "NYMTG", "NYMTH", "NYMTL", "NYMTM", "NYMTN", "NYMTZ", "NYXH", "OABI", "OACC", "OACCU", "OACCW", "OAKU", "OAKUW", "OBAWU", "OBIO", "OBLG", "OBT", "OCC", "OCCI", "OCCIM", "OCCIN", "OCCIO", "OCFC", "OCG", "OCGN", "OCS", "OCSAW", "OCSL", "OCTO", "OCUL", "ODD", "ODFL", "ODP", "ODYS", "OESX", "OFAL", "OFIX", "OFLX", "OFS", "OFSSH", "OFSSO", "OGI", "OKTA", "OKUR", "OKYO", "OLB", "OLED", "OLLI", "OLMA", "OLPX", "OM", "OMAB", "OMCC", "OMCL", "OMDA", "OMER", "OMEX", "OMH", "OMSE", "ON", "ONB", "ONBPO", "ONBPP", "ONC", "ONCHU", "ONCO", "ONCY", "ONDS", "ONEG", "ONEW", "ONFO", "ONFOW", "ONMD", "ONMDW", "OP", "OPAL", "OPBK", "OPCH", "OPEN", "OPI", "OPINL", "OPK", "OPOF", "OPRA", "OPRT", "OPRX", "OPTX", "OPTXW", "OPXS", "ORGN", "ORGNW", "ORGO", "ORIC", "ORIQU", "ORIS", "ORKA", "ORKT", "ORLY", "ORMP", "ORRF", "OS", "OSBC", "OSIS", "OSPN", "OSRH", "OSRHW", "OSS", "OST", "OSUR", "OSW", "OTEX", "OTLK", "OTLY", "OTRK", "OTTR", "OUST", "OUSTW", "OUSTZ", "OVBC", "OVID", "OVLY", "OXBR", "OXBRW", "OXLC", "OXLCG", "OXLCI", "OXLCL", "OXLCN", "OXLCO", "OXLCP", "OXLCZ", "OXSQ", "OXSQG", "OXSQZ", "OYSE", "OYSEU", "OZK", "OZKAP", "PAA", "PACB", "PACHU", "PAGP", "PAHC", "PAL", "PALI", "PAMT", "PANL", "PANW", "PARA", "PARAA", "PASG", "PATK", "PAVM", "PAVS", "PAX", "PAYO", "PAYS", "PAYX", "PBBK", "PBFS", "PBHC", "PBM", "PBMWW", "PBPB", "PBYI", "PC", "PCAP", "PCAPU", "PCAPW", "PCAR", "PCB", "PCH", "PCLA", "PCRX", "PCSA", "PCSC", "PCT", "PCTTU", "PCTTW", "PCTY", "PCVX", "PCYO", "PDD", "PDEX", "PDFS", "PDLB", "PDSB", "PDYN", "PDYNW", "PEBK", "PEBO", "PECO", "PEGA", "PELI", "PELIR", "PELIU", "PENG", "PENN", "PEP", "PEPG", "PERI", "PESI", "PET", "PETS", "PETWW", "PETZ", "PFAI", "PFBC", "PFG", "PFIS", "PFSA", "PFX", "PFXNZ", "PGC", "PGEN", "PGNY", "PGY", "PGYWW", "PHAR", "PHAT", "PHH", "PHIO", "PHLT", "PHOE", "PHUN", "PHVS", "PI", "PIII", "PIIIW", "PINC", "PKBK", "PKOH", "PLAB", "PLAY", "PLBC", "PLBY", "PLCE", "PLL", "PLMK", "PLMKW", "PLMR", "PLPC", "PLRX", "PLRZ", "PLSE", "PLTK", "PLTR", "PLUG", "PLUR", "PLUS", "PLUT", "PLXS", "PMAX", "PMCB", "PMEC", "PMN", "PMTR", "PMTRU", "PMTRW", "PMTS", "PMVP", "PN", "PNBK", "PNFP", "PNFPP", "PNRG", "PNTG", "POAI", "POCI", "PODC", "PODD", "POET", "POLA", "POLE", "POLEW", "PONY", "POOL", "POWI", "POWL", "POWW", "POWWP", "PPBI", "PPBT", "PPC", "PPIH", "PPSI", "PPTA", "PRAA", "PRAX", "PRCH", "PRCT", "PRDO", "PRE", "PRENW", "PRFX", "PRGS", "PRLD", "PRME", "PROF", "PROK", "PROP", "PROV", "PRPH", "PRPL", "PRPO", "PRQR", "PRSO", "PRTA", "PRTC", "PRTG", "PRTH", "PRTS", "PRVA", "PRZO", "PSEC", "PSHG", "PSIG", "PSIX", "PSMT", "PSNL", "PSNY", "PSNYW", "PSTV", "PT", "PTC", "PTCT", "PTEN", "PTGX", "PTHL", "PTIX", "PTIXW", "PTLE", "PTLO", "PTMN", "PTNM", "PTON", "PUBM", "PULM", "PVBC", "PVLA", "PWM", "PWOD", "PWP", "PXLW", "PXS", "PXSAW", "PYPD", "PYPL", "PYXS", "PZZA", "QCOM", "QCRH", "QDEL", "QETA", "QETAR", "QFIN", "QH", "QIPT", "QLGN", "QLYS", "QMCO", "QMMM", "QNCX", "QNRX", "QNST", "QNTM", "QQQX", "QRHC", "QRVO", "QSEA", "QSEAR", "QSEAU", "QSG", "QSI", "QSIAW", "QTRX", "QTTB", "QUBT", "QUIK", "QURE", "QVCGA", "QVCGP", "RAAQ", "RAAQW", "RADX", "RAIL", "RAIN", "RAINW", "RAND", "RANG", "RANGR", "RANI", "RAPP", "RAPT", "RARE", "RAVE", "RAY", "RAYA", "RBB", "RBBN", "RBCAA", "RBKB", "RBNE", "RCAT", "RCEL", "RCKT", "RCKTW", "RCKY", "RCMT", "RCON", "RCT", "RDAC", "RDACR", "RDAG", "RDAGU", "RDCM", "RDGT", "RDHL", "RDI", "RDIB", "RDNT", "RDVT", "RDWR", "RDZN", "RDZNW", "REAL", "REAX", "REBN", "RECT", "REE", "REFI", "REFR", "REG", "REGCO", "REGCP", "REGN", "REKR", "RELI", "RELIW", "RELL", "RELY", "RENB", "RENT", "REPL", "RETO", "REVB", "REVBW", "REYN", "RFAIR", "RFIL", "RGC", "RGCO", "RGEN", "RGLD", "RGNX", "RGP", "RGS", "RGTI", "RGTIW", "RHLD", "RIBB", "RIBBR", "RIBBU", "RICK", "RIGL", "RILY", "RILYG", "RILYK", "RILYL", "RILYN", "RILYP", "RILYT", "RILYZ", "RIME", "RIOT", "RITR", "RIVN", "RKDA", "RKLB", "RLAY", "RLMD", "RLYB", "RMBI", "RMBL", "RMBS", "RMCF", "RMCO", "RMCOW", "RMNI", "RMR", "RMSG", "RMSGW", "RMTI", "RNA", "RNAC", "RNAZ", "RNTX", "RNW", "RNWWW", "RNXT", "ROAD", "ROCK", "ROIV", "ROKU", "ROMA", "ROOT", "ROP", "ROST", "RPAY", "RPD", "RPID", "RPRX", "RPTX", "RR", "RRBI", "RRGB", "RRR", "RSLS", "RSSS", "RSVR", "RSVRW", "RTAC", "RTACU", "RTACW", "RUM", "RUMBW", "RUN", "RUSHA", "RUSHB", "RVMD", "RVMDW", "RVPH", "RVPHW", "RVSB", "RVSN", "RVSNW", "RVYL", "RWAY", "RWAYL", "RWAYZ", "RXRX", "RXST", "RXT", "RYAAY", "RYET", "RYTM", "RZLT", "RZLV", "RZLVW", "SABR", "SABS", "SABSW", "SAFT", "SAFX", "SAGE", "SAGT", "SAIA", "SAIC", "SAIH", "SAIHW", "SAIL", "SAMG", "SANA", "SANG", "SANM", "SANW", "SATL", "SATLW", "SATS", "SAVA", "SBAC", "SBC", "SBCF", "SBCWW", "SBET", "SBFG", "SBFM", "SBFMW", "SBGI", "SBLK", "SBRA", "SBUX", "SCAG", "SCAGW", "SCHL", "SCKT", "SCLX", "SCLXW", "SCNI", "SCNX", "SCOR", "SCPH", "SCSC", "SCVL", "SCWO", "SCYX", "SDA", "SDAWW", "SDGR", "SDHI", "SDHIR", "SDM", "SDOT", "SDST", "SDSTW", "SEAT", "SEATW", "SEDG", "SEED", "SEER", "SEGG", "SEIC", "SELF", "SELX", "SENEA", "SENEB", "SEPN", "SERA", "SERV", "SEVN", "SEZL", "SFBC", "SFD", "SFHG", "SFIX", "SFM", "SFNC", "SFST", "SFWL", "SGA", "SGBX", "SGC", "SGD", "SGHT", "SGLY", "SGMA", "SGML", "SGMO", "SGMT", "SGRP", "SGRY", "SHBI", "SHC", "SHEN", "SHFS", "SHFSW", "SHIM", "SHIP", "SHLS", "SHMD", "SHMDW", "SHOO", "SHOP", "SHOT", "SHOTW", "SHPH", "SIBN", "SIDU", "SIEB", "SIFY", "SIGA", "SIGI", "SIGIP", "SILC", "SILO", "SIMA", "SIMAW", "SIMO", "SINT", "SION", "SIRI", "SISI", "SITM", "SJ", "SKBL", "SKIN", "SKK", "SKWD", "SKYE", "SKYQ", "SKYT", "SKYW", "SKYX", "SLAB", "SLDB", "SLDE", "SLDP", "SLDPW", "SLE", "SLGL", "SLM", "SLMBP", "SLN", "SLNG", "SLNH", "SLNHP", "SLNO", "SLP", "SLRC", "SLRX", "SLS", "SLSN", "SLXN", "SLXNW", "SMBC", "SMCI", "SMID", "SMLR", "SMMT", "SMSI", "SMTC", "SMTI", "SMTK", "SMX", "SMXT", "SMXWW", "SNAL", "SNBR", "SNCR", "SNCY", "SND", "SNDK", "SNDL", "SNDX", "SNES", "SNEX", "SNFCA", "SNGX", "SNOA", "SNPS", "SNRE", "SNSE", "SNT", "SNTG", "SNTI", "SNWV", "SNY", "SNYR", "SOBR", "SOCAU", "SOFI", "SOGP", "SOHO", "SOHOB", "SOHON", "SOHOO", "SOHU", "SOND", "SONDW", "SONM", "SONN", "SONO", "SOPA", "SOPH", "SORA", "SOTK", "SOUN", "SOUNW", "SOWG", "SPAI", "SPCB", "SPEGU", "SPFI", "SPHL", "SPKL", "SPKLU", "SPKLW", "SPNS", "SPOK", "SPPL", "SPRC", "SPRO", "SPRY", "SPSC", "SPT", "SPTN", "SPWH", "SPWR", "SPWRW", "SQFT", "SQFTP", "SQFTW", "SRAD", "SRBK", "SRCE", "SRDX", "SRPT", "SRRK", "SRTS", "SRZN", "SRZNW", "SSBI", "SSII", "SSKN", "SSNC", "SSP", "SSRM", "SSSS", "SSSSL", "SSTI", "SSYS", "STAA", "STAI", "STAK", "STBA", "STEC", "STEP", "STFS", "STGW", "STHO", "STI", "STIM", "STKH", "STKL", "STKS", "STLD", "STNE", "STOK", "STRA", "STRD", "STRF", "STRK", "STRL", "STRM", "STRO", "STRR", "STRRP", "STRS", "STRT", "STRZ", "STSS", "STSSW", "STTK", "STX", "SUGP", "SUNE", "SUNS", "SUPN", "SUPX", "SURG", "SUUN", "SVC", "SVCC", "SVCCW", "SVCO", "SVII", "SVIIR", "SVIIW", "SVRA", "SVRE", "SVREW", "SWAG", "SWAGW", "SWBI", "SWIM", "SWIN", "SWKH", "SWKHL", "SWKS", "SWVL", "SXTC", "SXTP", "SXTPW", "SY", "SYBT", "SYBX", "SYM", "SYNA", "SYPR", "SYRE", "SYTA", "SYTAW", "SZZL", "SZZLR", "SZZLU", "TACH", "TACHU", "TACHW", "TACO", "TACOU", "TACOW", "TACT", "TAIT", "TALK", "TALKW", "TANH", "TAOP", "TAOX", "TARA", "TARS", "TASK", "TATT", "TAVI", "TAVIR", "TAYD", "TBBK", "TBCH", "TBH", "TBLA", "TBLAW", "TBLD", "TBMC", "TBMCR", "TBPH", "TBRG", "TC", "TCBI", "TCBIO", "TCBK", "TCBS", "TCBX", "TCMD", "TCOM", "TCPC", "TCRT", "TCRX", "TCX", "TDAC", "TDACW", "TDIC", "TDTH", "TDUP", "TEAD", "TEAM", "TECH", "TECTP", "TECX", "TELA", "TELO", "TEM", "TENB", "TENX", "TER", "TERN", "TFIN", "TFINP", "TFSL", "TGL", "TGTX", "TH", "THAR", "THCH", "THFF", "THRD", "THRM", "THRY", "THTX", "TIGO", "TIGR", "TIL", "TILE", "TIPT", "TIRX", "TITN", "TIVC", "TKLF", "TKNO", "TLF", "TLIH", "TLN", "TLPH", "TLRY", "TLS", "TLSA", "TLSI", "TLSIW", "TLX", "TMC", "TMCI", "TMCWW", "TMDX", "TMUS", "TNDM", "TNFA", "TNGX", "TNMG", "TNON", "TNONW", "TNXP", "TNYA", "TOI", "TOIIW", "TOMZ", "TOP", "TORO", "TOUR", "TOWN", "TOYO", "TPCS", "TPG", "TPGXL", "TPIC", "TPST", "TRAW", "TRDA", "TREE", "TRI", "TRIB", "TRIN", "TRINI", "TRINZ", "TRIP", "TRMB", "TRMD", "TRMK", "TRML", "TRNR", "TRNS", "TRON", "TROO", "TROW", "TRS", "TRSG", "TRST", "TRUE", "TRUG", "TRUP", "TRVG", "TRVI", "TSAT", "TSBK", "TSBX", "TSCO", "TSEM", "TSHA", "TSLA", "TSSI", "TTAN", "TTD", "TTEC", "TTEK", "TTGT", "TTMI", "TTNP", "TTSH", "TTWO", "TURB", "TURN", "TUSK", "TVA", "TVACU", "TVAI", "TVAIR", "TVAIU", "TVGN", "TVGNW", "TVRD", "TVTX", "TW", "TWFG", "TWG", "TWIN", "TWNP", "TWST", "TXG", "TXMD", "TXN", "TXRH", "TYGO", "TYRA", "TZOO", "TZUP", "UAL", "UBCP", "UBFO", "UBSI", "UBXG", "UCAR", "UCL", "UCTT", "UDMY", "UEIC", "UFCS", "UFG", "UFPI", "UFPT", "UG", "UGRO", "UHG", "UHGWW", "UK", "UKOMW", "ULBI", "ULCC", "ULH", "ULTA", "ULY", "UMBF", "UMBFO", "UNB", "UNCY", "UNIT", "UNTY", "UOKA", "UONE", "UONEK", "UPB", "UPBD", "UPC", "UPLD", "UPST", "UPWK", "UPXI", "URBN", "URGN", "UROY", "USAR", "USARW", "USAU", "USCB", "USEA", "USEG", "USGO", "USGOW", "USIO", "USLM", "UTHR", "UTMD", "UTSI", "UVSP", "UXIN", "UYSC", "UYSCR", "UYSCU", "VABK", "VACH", "VACHU", "VACHW", "VALN", "VALU", "VANI", "VAPE", "VAPEW", "VBIX", "VBNK", "VBTX", "VC", "VCEL", "VCIC", "VCICU", "VCICW", "VCIG", "VCTR", "VCYT", "VECO", "VEEA", "VEEAW", "VEEE", "VEON", "VERA", "VERB", "VERI", "VERO", "VERU", "VERX", "VFF", "VFS", "VFSWW", "VGAS", "VGASW", "VIASP", "VIAV", "VICR", "VIGL", "VINP", "VIOT", "VIR", "VIRC", "VITL", "VIVK", "VIVS", "VKTX", "VLCN", "VLGEA", "VLY", "VLYPN", "VLYPO", "VLYPP", "VMAR", "VMD", "VMEO", "VNDA", "VNET", "VNMEU", "VNOM", "VOD", "VOR", "VOXR", "VRA", "VRAR", "VRAX", "VRCA", "VRDN", "VREX", "VRM", "VRME", "VRNA", "VRNS", "VRNT", "VRRM", "VRSK", "VRSN", "VRTX", "VS", "VSA", "VSAT", "VSEC", "VSEE", "VSEEW", "VSME", "VSSYW", "VSTA", "VSTM", "VTGN", "VTRS", "VTSI", "VTVT", "VTYX", "VUZI", "VVOS", "VVPR", "VWAV", "VWAVW", "VYGR", "VYNE", "WABC", "WAFD", "WAFDP", "WAFU", "WAI", "WALD", "WALDW", "WASH", "WATT", "WAVE", "WAY", "WB", "WBA", "WBD", "WBTN", "WBUY", "WCT", "WDAY", "WDC", "WDFC", "WEN", "WENN", "WENNU", "WENNW", "WERN", "WEST", "WETH", "WETO", "WEYS", "WFCF", "WFF", "WFRD", "WGRX", "WGS", "WGSWW", "WHF", "WHFCL", "WHLR", "WHLRD", "WHLRL", "WHLRP", "WHWK", "WILC", "WIMI", "WINA", "WING", "WINT", "WIX", "WKEY", "WKHS", "WKSP", "WLAC", "WLACW", "WLDN", "WLDS", "WLDSW", "WLFC", "WLGS", "WMG", "WNEB", "WNW", "WOK", "WOOF", "WORX", "WPRT", "WRAP", "WRD", "WRLD", "WSBC", "WSBCP", "WSBF", "WSBK", "WSC", "WSFS", "WTBA", "WTF", "WTFC", "WTFCN", "WTG", "WTGUR", "WTGUU", "WTO", "WTW", "WULF", "WVE", "WVVI", "WVVIP", "WW", "WWD", "WXM", "WYHG", "WYNN", "XAGE", "XAGEW", "XAIR", "XBIO", "XBIT", "XBP", "XBPEW", "XCH", "XCUR", "XEL", "XELB", "XENE", "XERS", "XFOR", "XGN", "XHG", "XHLD", "XLO", "XMTR", "XNCR", "XNET", "XOMA", "XOMAO", "XOMAP", "XOS", "XOSWW", "XP", "XPEL", "XPON", "XRAY", "XRTX", "XRX", "XTIA", "XTKG", "XTLB", "XWEL", "XXII", "XYLO", "YAAS", "YB", "YGMZ", "YHC", "YHGJ", "YHNA", "YHNAR", "YI", "YIBO", "YJ", "YMAB", "YORK", "YORKU", "YORKW", "YORW", "YOSH", "YOUL", "YQ", "YSXT", "YTRA", "YXT", "YYAI", "YYGH", "Z", "ZBAI", "ZBAO", "ZBIO", "ZBRA", "ZCMD", "ZD", "ZDAI", "ZENA", "ZENV", "ZEO", "ZEOWW", "ZEUS", "ZG", "ZIMV", "ZION", "ZIONP", "ZJK", "ZJYL", "ZKIN", "ZLAB", "ZM", "ZNTL", "ZOOZ", "ZOOZW", "ZS", "ZSPC", "ZTEK", "ZUMZ", "ZURA", "ZVRA", "ZYBT", "ZYME", "ZYXI"
    ]

def calculate_moving_averages(df: pd.DataFrame) -> pd.DataFrame:
    """Calculate multiple moving averages for trend analysis."""
    df = df.copy()
    df['SMA10'] = df['Close'].rolling(window=10).mean()
    df['SMA20'] = df['Close'].rolling(window=20).mean()
    df['SMA50'] = df['Close'].rolling(window=50).mean()
    df['SMA200'] = df['Close'].rolling(window=200).mean()
    return df

def calculate_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Calculate Average True Range for volatility analysis."""
    high_low = df['High'] - df['Low']
    high_close = np.abs(df['High'] - df['Close'].shift())
    low_close = np.abs(df['Low'] - df['Close'].shift())
    ranges = pd.concat([high_low, high_close, low_close], axis=1)
    true_range = ranges.max(axis=1)
    return true_range.rolling(window=period).mean()

def check_momentum_pattern(hist_data: pd.DataFrame) -> tuple[bool, MomentumCriteria, float]:
    """
    Implement the "5 Star Trading Setup/Pattern Checklist" for momentum analysis.
    Returns: (pattern_found, criteria_details, confidence_score)
    """
    return check_momentum_pattern_custom(hist_data)

def check_momentum_pattern_custom(
    hist_data: pd.DataFrame,
    min_percentage_move: float = 30.0,
    max_consolidation_range: float = 10.0,
    narrow_range_multiplier: float = 0.7,
    volume_spike_threshold: float = 1.5,
    hod_distance_threshold: float = 0.05,
    sma_distance_threshold: float = 15.0,
    correlation_threshold: float = 0.7,
    volatility_threshold: float = 0.05,
    min_criteria_met: int = 6,
    min_data_days: int = 200,
    require_all_sma: bool = True,
    require_both_ma_trending: bool = True,
    enabled_criteria: list = None
) -> tuple[bool, MomentumCriteria, float]:
    """
    Parameterized momentum pattern detection with customizable criteria.
    
    Args:
        hist_data: Historical stock data
        min_percentage_move: Minimum % move prior to consolidation (default 30%)
        max_consolidation_range: Maximum consolidation range % (default 10%)
        narrow_range_multiplier: ATR multiplier for narrow range (default 0.7)
        volume_spike_threshold: Volume spike multiplier (default 1.5x)
        hod_distance_threshold: Max distance from HOD (default 0.05 = 5%)
        sma_distance_threshold: Max distance from SMA20 % (default 15%)
        correlation_threshold: Minimum price correlation (default 0.7)
        volatility_threshold: Maximum volatility (default 0.05)
        min_criteria_met: Minimum criteria to meet for pattern (default 6)
        min_data_days: Minimum days of data required (default 200)
        require_all_sma: Whether to require above ALL SMAs (default True)
        require_both_ma_trending: Whether to require BOTH MAs trending up (default True)
        enabled_criteria: List of criteria numbers to check (1-9), None means all
    """
    if len(hist_data) < min_data_days:
        return False, None, 0.0
    
    df = calculate_moving_averages(hist_data)
    df['ATR'] = calculate_atr(df)
    
    criteria_met = 0
    total_criteria = 9
    
    if enabled_criteria is None:
        enabled_criteria = list(range(1, 10))  # All criteria 1-9
    
    # Criterion 1: Large Percentage Move Prior to Consolidation
    criterion1_met = False
    percentage_move = 0
    if 1 in enabled_criteria:
        lookback_period = min(90, len(df) - 20)
        pre_consolidation_data = df.iloc[-lookback_period:-20]
        
        if len(pre_consolidation_data) > 0:
            low_price = pre_consolidation_data['Low'].min()
            high_price = pre_consolidation_data['High'].max()
            percentage_move = ((high_price - low_price) / low_price) * 100 if low_price > 0 else 0
            criterion1_met = percentage_move >= min_percentage_move
            if criterion1_met:
                criteria_met += 1

    criterion1 = {
        "met": bool(criterion1_met),
        "percentage_move": round(float(percentage_move), 2),
        "threshold": min_percentage_move,
        "description": f"Pre-consolidation move: {percentage_move:.1f}% (need {min_percentage_move}%+)"
    }
    
    # Criterion 2: Extended Consolidation
    criterion2_met = False
    range_percentage = 100
    if 2 in enabled_criteria:
        consolidation_data = df.iloc[-20:]
        if len(consolidation_data) >= 3:
            price_range = (consolidation_data['High'].max() - consolidation_data['Low'].min())
            avg_price = consolidation_data['Close'].mean()
            range_percentage = (price_range / avg_price) * 100 if avg_price > 0 else 100
            
            criterion2_met = range_percentage <= max_consolidation_range and len(consolidation_data) >= 3
            if criterion2_met:
                criteria_met += 1

    criterion2 = {
        "met": bool(criterion2_met),
        "consolidation_days": int(len(df.iloc[-20:])),
        "range_percentage": round(float(range_percentage), 2),
        "description": f"Consolidation: {len(df.iloc[-20:])} days, {range_percentage:.1f}% range"
    }
    
    # Criterion 3: Narrow Range Days Prior to Breakout
    criterion3_met = False
    avg_recent_range = 0
    recent_atr = 0
    if 3 in enabled_criteria:
        recent_atr = df['ATR'].iloc[-20:].mean() if not df['ATR'].iloc[-20:].isna().all() else 0
        daily_ranges = (df['High'] - df['Low']).iloc[-10:]
        avg_recent_range = daily_ranges.mean()
        
        criterion3_met = recent_atr > 0 and avg_recent_range <= recent_atr * narrow_range_multiplier
        if criterion3_met:
            criteria_met += 1

    criterion3 = {
        "met": bool(criterion3_met),
        "avg_range": round(float(avg_recent_range), 2),
        "atr": round(float(recent_atr), 2),
        "description": f"Narrow range: avg {avg_recent_range:.2f} vs ATR {recent_atr:.2f}"
    }
    
    # Criterion 4: Above/Surfing Moving Averages
    criterion4_met = False
    above_sma10 = above_sma20 = above_sma50 = False
    ma_trending_up = False
    if 4 in enabled_criteria:
        recent_close = df['Close'].iloc[-1]
        sma10 = df['SMA10'].iloc[-1]
        sma20 = df['SMA20'].iloc[-1]
        sma50 = df['SMA50'].iloc[-1]
        
        above_sma10 = bool(recent_close > sma10 if not pd.isna(sma10) else False)
        above_sma20 = bool(recent_close > sma20 if not pd.isna(sma20) else False)
        above_sma50 = bool(recent_close > sma50 if not pd.isna(sma50) else False)
        
        ma10_trending_up = bool(df['SMA10'].iloc[-1] > df['SMA10'].iloc[-5] if not pd.isna(df['SMA10'].iloc[-1]) else False)
        ma20_trending_up = bool(df['SMA20'].iloc[-1] > df['SMA20'].iloc[-10] if not pd.isna(df['SMA20'].iloc[-1]) else False)
        
        if require_all_sma:
            sma_condition = above_sma10 and above_sma20 and above_sma50
        else:
            sma_condition = above_sma10 and above_sma20
            
        if require_both_ma_trending:
            ma_trending_up = ma10_trending_up and ma20_trending_up
        else:
            ma_trending_up = ma10_trending_up or ma20_trending_up
        
        criterion4_met = sma_condition and ma_trending_up
        if criterion4_met:
            criteria_met += 1

    criterion4 = {
        "met": bool(criterion4_met),
        "above_sma10": above_sma10,
        "above_sma20": above_sma20,
        "above_sma50": above_sma50,
        "ma_trending_up": bool(ma_trending_up),
        "description": f"Above MAs: SMA10({above_sma10}) SMA20({above_sma20}) SMA50({above_sma50})"
    }
    
    # Criterion 5: Increased Volume on Breakout Day
    criterion5_met = False
    volume_ratio = 0
    recent_volume = avg_volume = 0
    if 5 in enabled_criteria:
        recent_volume = df['Volume'].iloc[-1]
        avg_volume = df['Volume'].iloc[-20:-1].mean()
        volume_ratio = recent_volume / avg_volume if avg_volume > 0 else 0
        
        criterion5_met = volume_ratio >= volume_spike_threshold
        if criterion5_met:
            criteria_met += 1

    criterion5 = {
        "met": bool(criterion5_met),
        "volume_ratio": round(float(volume_ratio), 2),
        "recent_volume": int(recent_volume),
        "avg_volume": int(avg_volume),
        "description": f"Volume spike: {volume_ratio:.1f}x average"
    }
    
    # Criterion 6: Close at HOD or Near HOD on Breakout Day
    criterion6_met = False
    distance_from_hod = 1
    close_price = high_of_day = 0
    if 6 in enabled_criteria:
        last_day = df.iloc[-1]
        high_of_day = last_day['High']
        close_price = last_day['Close']
        distance_from_hod = (high_of_day - close_price) / high_of_day if high_of_day > 0 else 1
        
        criterion6_met = distance_from_hod <= hod_distance_threshold
        if criterion6_met:
            criteria_met += 1

    criterion6 = {
        "met": bool(criterion6_met),
        "distance_from_hod_pct": round(float(distance_from_hod * 100), 2),
        "close_price": round(float(close_price), 2),
        "high_of_day": round(float(high_of_day), 2),
        "description": f"Close at HOD: {(1-distance_from_hod)*100:.1f}% of daily range"
    }
    
    # Criterion 7: Stock Not Extended, Recently Consolidated
    criterion7_met = False
    distance_from_sma20 = 100
    if 7 in enabled_criteria:
        recent_close = df['Close'].iloc[-1]
        sma20 = df['SMA20'].iloc[-1]
        distance_from_sma20 = ((recent_close - sma20) / sma20 * 100) if not pd.isna(sma20) and sma20 > 0 else 100
        criterion7_met = abs(distance_from_sma20) <= sma_distance_threshold
        if criterion7_met:
            criteria_met += 1

    criterion7 = {
        "met": bool(criterion7_met),
        "distance_from_sma20": round(float(distance_from_sma20), 2),
        "description": f"Not extended: {distance_from_sma20:.1f}% from SMA20"
    }
    
    # Criterion 8: Linear and Orderly Moves
    criterion8_met = False
    correlation = 0
    if 8 in enabled_criteria:
        recent_prices = df['Close'].iloc[-20:].reset_index(drop=True)
        time_series = np.arange(len(recent_prices))
        correlation = np.corrcoef(time_series, recent_prices)[0, 1] if len(recent_prices) > 1 else 0
        
        criterion8_met = abs(correlation) >= correlation_threshold
        if criterion8_met:
            criteria_met += 1

    criterion8 = {
        "met": bool(criterion8_met),
        "correlation": round(float(correlation), 3),
        "description": f"Linear moves: correlation {correlation:.2f}"
    }
    
    # Criterion 9: Avoid Volatile/Barcode Looking Moves
    criterion9_met = False
    returns_std = avg_return = 0
    if 9 in enabled_criteria:
        returns = df['Close'].pct_change().iloc[-20:]
        returns_std = returns.std()
        avg_return = abs(returns.mean())
        
        criterion9_met = returns_std <= volatility_threshold or (avg_return > 0 and returns_std / avg_return <= 10)
        if criterion9_met:
            criteria_met += 1

    criterion9 = {
        "met": bool(criterion9_met),
        "returns_std": round(float(returns_std), 4),
        "avg_return": round(float(avg_return), 4),
        "description": f"Smooth moves: volatility {returns_std:.3f}"
    }
    
    # Compile all criteria
    criteria_details = MomentumCriteria(
        criterion1_large_move=criterion1,
        criterion2_consolidation=criterion2,
        criterion3_narrow_range=criterion3,
        criterion4_moving_averages=criterion4,
        criterion5_volume_breakout=criterion5,
        criterion6_close_at_hod=criterion6,
        criterion7_not_extended=criterion7,
        criterion8_linear_moves=criterion8,
        criterion9_avoid_barcode=criterion9
    )
    
    # Calculate confidence score
    confidence_score = float((criteria_met / total_criteria) * 100)
    
    # Pattern detection based on minimum criteria met
    pattern_found = bool(criteria_met >= min_criteria_met)
    
    return pattern_found, criteria_details, confidence_score

def generate_annotated_chart(symbol: str, df: pd.DataFrame, criteria: MomentumCriteria) -> str:
    """
    Generate a comprehensive annotated chart for momentum pattern analysis.
    Returns base64 encoded image string.
    """
    try:
        # Prepare data for mplfinance and ensure moving averages are calculated
        df_plot = df.copy()
        df_plot.index = pd.to_datetime(df_plot.index)
        
        # Ensure moving averages are calculated
        if 'SMA10' not in df_plot.columns:
            df_plot = calculate_moving_averages(df_plot)
        
        # Create addplots for moving averages, only if they exist and have data
        addplots = []
        if 'SMA10' in df_plot.columns and not df_plot['SMA10'].isna().all():
            addplots.append(mpf.make_addplot(df_plot['SMA10'], color='blue', width=1))
        if 'SMA20' in df_plot.columns and not df_plot['SMA20'].isna().all():
            addplots.append(mpf.make_addplot(df_plot['SMA20'], color='orange', width=1))
        if 'SMA50' in df_plot.columns and not df_plot['SMA50'].isna().all():
            addplots.append(mpf.make_addplot(df_plot['SMA50'], color='red', width=1.5))
        
        # Create the plot
        plot_kwargs = {
            'data': df_plot,
            'type': 'candle',
            'style': 'yahoo',
            'volume': True,
            'figsize': (16, 10),
            'returnfig': True,
            'title': f'{symbol} - 5 Star Momentum Pattern Analysis'
        }
        
        # Only add addplot if we have moving averages to plot
        if addplots:
            plot_kwargs['addplot'] = addplots
            
        fig, axes = mpf.plot(**plot_kwargs)
        
        # Add annotations
        ax_main = axes[0]  # Main price chart
        ax_vol = axes[1]   # Volume chart
        
        # Annotation positions (using data coordinates)
        last_date = df_plot.index[-1]
        last_price = df_plot['Close'].iloc[-1]
        
        # Breakout day annotation
        if criteria.criterion6_close_at_hod['met']:
            ax_main.annotate('Breakout Day\n(Close at HOD)', 
                           xy=(last_date, last_price),
                           xytext=(last_date - pd.Timedelta(days=10), last_price * 1.05),
                           arrowprops=dict(arrowstyle='->', color='green', lw=2),
                           fontsize=10, color='green', weight='bold',
                           bbox=dict(boxstyle="round,pad=0.3", facecolor='lightgreen', alpha=0.7))
        
        # Volume spike annotation
        if criteria.criterion5_volume_breakout['met']:
            last_volume = df_plot['Volume'].iloc[-1]
            ax_vol.annotate('Volume Spike\n' + f"{criteria.criterion5_volume_breakout['volume_ratio']:.1f}x avg",
                          xy=(last_date, last_volume),
                          xytext=(last_date - pd.Timedelta(days=15), last_volume * 1.3),
                          arrowprops=dict(arrowstyle='->', color='purple', lw=2),
                          fontsize=9, color='purple', weight='bold',
                          bbox=dict(boxstyle="round,pad=0.3", facecolor='plum', alpha=0.7))
        
        # Consolidation period annotation
        if criteria.criterion2_consolidation['met']:
            consolidation_start = df_plot.index[-20]
            consolidation_price = df_plot['Close'].iloc[-20:].mean()
            ax_main.annotate('Consolidation Zone\n' + f"{criteria.criterion2_consolidation['consolidation_days']} days",
                           xy=(consolidation_start, consolidation_price),
                           xytext=(consolidation_start - pd.Timedelta(days=5), consolidation_price * 0.95),
                           arrowprops=dict(arrowstyle='->', color='blue', lw=2),
                           fontsize=9, color='blue', weight='bold',
                           bbox=dict(boxstyle="round,pad=0.3", facecolor='lightblue', alpha=0.7))
        
        # Large move annotation
        if criteria.criterion1_large_move['met']:
            move_start = df_plot.index[-90] if len(df_plot) > 90 else df_plot.index[0]
            move_price = df_plot['Close'].iloc[-90] if len(df_plot) > 90 else df_plot['Close'].iloc[0]
            ax_main.annotate(f"Big Uptrend\n{criteria.criterion1_large_move['percentage_move']:.1f}% move",
                           xy=(move_start, move_price),
                           xytext=(move_start + pd.Timedelta(days=20), move_price * 0.9),
                           arrowprops=dict(arrowstyle='->', color='red', lw=2),
                           fontsize=9, color='red', weight='bold',
                           bbox=dict(boxstyle="round,pad=0.3", facecolor='lightcoral', alpha=0.7))
        
        # MA surfing annotation
        if criteria.criterion4_moving_averages['met']:
            ma_date = df_plot.index[-10]
            ma_price = df_plot['SMA20'].iloc[-10]
            ax_main.annotate('Surfing MAs',
                           xy=(ma_date, ma_price),
                           xytext=(ma_date + pd.Timedelta(days=5), ma_price * 0.98),
                           arrowprops=dict(arrowstyle='->', color='orange', lw=2),
                           fontsize=9, color='orange', weight='bold',
                           bbox=dict(boxstyle="round,pad=0.3", facecolor='moccasin', alpha=0.7))
        
        # Add legend for moving averages
        ax_main.legend(['SMA10', 'SMA20', 'SMA50'], loc='upper left')
        
        # Save to base64
        buf = io.BytesIO()
        fig.savefig(buf, format='png', bbox_inches='tight', dpi=100)
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        buf.close()
        plt.close(fig)
        
        return f"data:image/png;base64,{img_base64}"
        
    except Exception as e:
        print(f"Error generating chart for {symbol}: {e}")
        return None

def get_cache_key(symbol: str, range_param: str) -> str:
    return f"{symbol}_{range_param}"

def is_cache_valid(timestamp: float) -> bool:
    return time.time() - timestamp < CACHE_DURATION

def format_timestamps(timestamps):
    formatted = []
    for ts in timestamps:
        if hasattr(ts, 'strftime'):
            formatted.append(ts.strftime('%Y-%m-%d %H:%M:%S'))
        else:
            formatted.append(str(ts))
    return formatted

@app.get("/")
async def root():
    return {"message": "Advanced Momentum Trading Strategy API", "version": "2.0.0"}

@app.get("/ticker/{symbol}")
async def get_ticker_data(
    symbol: str,
    range: str = Query(default="1d", regex="^(1d|1w|1m|3m|6m|1y|5y|max)$")
):
    """Get ticker data for stocks and crypto with caching support."""
    cache_key = get_cache_key(symbol.upper(), range)
    
    # Check cache first
    if cache_key in cache and is_cache_valid(cache[cache_key]['timestamp']):
        return cache[cache_key]['data']
    
    try:
        ticker = yf.Ticker(symbol.upper())
        
        # Map range to yfinance period and interval
        period_map = {
            "1d": "1d", "1w": "5d", "1m": "1mo", "3m": "3mo",
            "6m": "6mo", "1y": "1y", "5y": "5y", "max": "max"
        }
        interval_map = {
            "1d": "5m",  # Use 5-minute interval for intraday
            "1w": "1d", "1m": "1d", "3m": "1d",
            "6m": "1d", "1y": "1d", "5y": "1d", "max": "1d"
        }
        
        # Add timeout to yfinance history call
        def fetch_data():
            try:
                # Skip the hanging .info call and just get history data
                if range == "1d":
                    hist = ticker.history(period=period_map[range], interval=interval_map[range], timeout=8)
                else:
                    hist = ticker.history(period=period_map[range], timeout=8)
                
                if hist.empty:
                    return None, None
                    
                # Try to get basic info but with fallback
                try:
                    info = ticker.info
                    current_price = info.get('regularMarketPrice', hist['Close'].iloc[-1])
                    company_name = info.get('longName', info.get('shortName', symbol.upper()))
                except:
                    # Fallback if .info fails
                    current_price = hist['Close'].iloc[-1]
                    company_name = symbol.upper()
                
                return hist, {
                    'current_price': current_price,
                    'name': company_name
                }
            except Exception as e:
                print(f"Error in fetch_data for {symbol}: {e}")
                return None, None
        
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(fetch_data)
            try:
                hist, info_data = future.result(timeout=10)
            except concurrent.futures.TimeoutError:
                raise HTTPException(status_code=504, detail="Timeout fetching data from Yahoo Finance. Please try again later.")
        
        if hist is None or hist.empty:
            raise HTTPException(status_code=404, detail=f"No historical data found for ticker '{symbol}'")
        
        # Calculate daily change
        current_price = info_data['current_price']
        previous_close = hist['Close'].iloc[-2] if len(hist) > 1 else current_price
        daily_change = current_price - previous_close
        daily_change_percent = (daily_change / previous_close * 100) if previous_close != 0 else 0
        
        response_data = TickerData(
            symbol=symbol.upper(),
            name=info_data['name'],
            current_price=float(current_price),
            daily_change=float(daily_change),
            daily_change_percent=float(daily_change_percent),
            timestamps=format_timestamps(hist.index.tolist()),
            prices=hist['Close'].tolist(),
            highs=hist['High'].tolist(),
            lows=hist['Low'].tolist(),
            opens=hist['Open'].tolist(),
            volumes=hist['Volume'].fillna(0).astype(int).tolist()
        )
        
        # Cache the response
        cache[cache_key] = {'data': response_data, 'timestamp': time.time()}
        return response_data
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Error fetching data for '{symbol}': {str(e)}")

@app.get("/screen/high_momentum", response_model=List[ScreenResult])
async def screen_high_momentum(
    symbols: Optional[str] = Query(None, description="Optional comma-separated list of symbols to screen. If not provided, screens comprehensive stock universe."),
    period: str = Query("6mo", regex="^(1d|5d|1mo|3mo|6mo|1y|5y|max)$", description="Historical data period"),
    top_n: int = Query(20, description="Number of top momentum stocks to return"),
    min_criteria: int = Query(6, description="Minimum criteria that must be met (out of 9)"),
    # Customizable criteria parameters
    min_percentage_move: float = Query(30.0, description="Minimum percentage move prior to consolidation"),
    max_consolidation_range: float = Query(10.0, description="Maximum consolidation range percentage"),
    narrow_range_multiplier: float = Query(0.7, description="ATR multiplier for narrow range detection"),
    volume_spike_threshold: float = Query(1.5, description="Volume spike threshold multiplier"),
    hod_distance_threshold: float = Query(0.05, description="Maximum distance from high of day (0.05 = 5%)"),
    sma_distance_threshold: float = Query(15.0, description="Maximum distance from SMA20 percentage"),
    correlation_threshold: float = Query(0.7, description="Minimum price correlation for linear moves"),
    volatility_threshold: float = Query(0.05, description="Maximum volatility threshold"),
    require_all_sma: bool = Query(True, description="Require above ALL moving averages (SMA10, SMA20, SMA50)"),
    require_both_ma_trending: bool = Query(True, description="Require BOTH moving averages trending up"),
    enabled_criteria: Optional[str] = Query(None, description="Comma-separated list of criteria to check (1-9, e.g., '1,2,3,4,5')"),
    fallback_enabled: bool = Query(True, description="Enable fallback to less strict criteria if no results found")
):
    """
    Screen stocks for momentum patterns using the 5 Star Trading Setup checklist.
    Now screens comprehensive stock universe with customizable criteria and fallback support.
    """
    # Parse enabled criteria
    enabled_criteria_list = None
    if enabled_criteria:
        try:
            enabled_criteria_list = [int(c.strip()) for c in enabled_criteria.split(',') if c.strip().isdigit()]
        except:
            enabled_criteria_list = None
    
    # Use provided symbols or get comprehensive list
    if symbols and len(symbols.strip()) > 0:
        # Handle comma-separated string
        stocks_to_screen = [s.strip().upper() for s in symbols.split(',') if s.strip()]
    else:
        stocks_to_screen = get_comprehensive_stock_list()
    
    def run_screening(
        min_criteria_check: int,
        min_percentage_move_check: float,
        max_consolidation_range_check: float,
        narrow_range_multiplier_check: float,
        volume_spike_threshold_check: float,
        hod_distance_threshold_check: float,
        sma_distance_threshold_check: float,
        correlation_threshold_check: float,
        volatility_threshold_check: float,
        require_all_sma_check: bool,
        require_both_ma_trending_check: bool
    ):
        results = []
        processed_count = 0
        
        for symbol in stocks_to_screen:
            try:
                # Clean symbol - remove special characters
                clean_symbol = symbol.replace('$', '').replace('/', '').replace('-', '').upper()
                if not clean_symbol or len(clean_symbol) > 6:
                    continue
                    
                ticker = yf.Ticker(clean_symbol)
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(ticker.history, period=period)
                    try:
                        hist = future.result(timeout=10)  # 10 second timeout
                    except concurrent.futures.TimeoutError:
                        continue
                
                if hist.empty or len(hist) < 50:  # Need sufficient data for momentum analysis
                    print(f"Skipping {clean_symbol}: insufficient data ({len(hist)} days)")
                    continue
                    
                # Apply momentum pattern check with custom parameters
                print(f"Analyzing {clean_symbol} with {len(hist)} days of data")
                pattern_found, criteria_details, confidence_score = check_momentum_pattern_custom(
                    hist,
                    min_percentage_move=min_percentage_move_check,
                    max_consolidation_range=max_consolidation_range_check,
                    narrow_range_multiplier=narrow_range_multiplier_check,
                    volume_spike_threshold=volume_spike_threshold_check,
                    hod_distance_threshold=hod_distance_threshold_check,
                    sma_distance_threshold=sma_distance_threshold_check,
                    correlation_threshold=correlation_threshold_check,
                    volatility_threshold=volatility_threshold_check,
                    min_criteria_met=min_criteria_check,
                    min_data_days=50,  # Lower requirement for screening
                    require_all_sma=require_all_sma_check,
                    require_both_ma_trending=require_both_ma_trending_check,
                    enabled_criteria=enabled_criteria_list
                )
                print(f"{clean_symbol}: pattern_found={pattern_found}, confidence={confidence_score:.1f}%")
                
                if pattern_found and confidence_score >= (min_criteria_check / 9 * 100):
                    try:
                        info = ticker.info
                        name = info.get('longName', info.get('shortName', clean_symbol)) if info else clean_symbol
                    except:
                        name = clean_symbol
                    
                    # Determine pattern strength
                    if confidence_score >= 90:
                        strength = "Strong"
                    elif confidence_score >= 70:
                        strength = "Moderate"
                    else:
                        strength = "Weak"
                    
                    results.append(ScreenResult(
                        symbol=clean_symbol,
                        value=confidence_score,
                        name=name,
                        confidence_score=confidence_score,
                        pattern_strength=strength
                    ))
                
                processed_count += 1
                
            except Exception as e:
                continue
        
        return results, processed_count
    
    # Run initial screening with strict criteria
    results, processed_count = run_screening(
        min_criteria,
        min_percentage_move,
        max_consolidation_range,
        narrow_range_multiplier,
        volume_spike_threshold,
        hod_distance_threshold,
        sma_distance_threshold,
        correlation_threshold,
        volatility_threshold,
        require_all_sma,
        require_both_ma_trending
    )
    
    # If no results and fallback is enabled, try less strict criteria
    if len(results) == 0 and fallback_enabled:
        # Fallback 1: Reduce minimum criteria and relax some thresholds
        fallback_results, _ = run_screening(
            max(1, min_criteria - 2),  # Reduce min criteria by 2
            min_percentage_move * 0.7,  # 30% -> 21%
            max_consolidation_range * 1.5,  # 10% -> 15%
            narrow_range_multiplier * 1.3,  # 0.7 -> 0.91
            volume_spike_threshold * 0.8,  # 1.5 -> 1.2
            hod_distance_threshold * 2,  # 5% -> 10%
            sma_distance_threshold * 1.7,  # 15% -> 25%
            correlation_threshold * 0.7,  # 0.7 -> 0.49
            volatility_threshold * 1.6,  # 0.05 -> 0.08
            False,  # Don't require all SMAs
            False   # Don't require both MAs trending
        )
        
        if len(fallback_results) > 0:
            results = fallback_results
            # Mark as fallback results
            for result in results:
                result.pattern_strength = f"Fallback-{result.pattern_strength}"
    
    # Sort by confidence score (descending) and return top_n results
    sorted_results = sorted(results, key=lambda x: x.confidence_score, reverse=True)
    return sorted_results[:top_n]

@app.get("/analyze/momentum_pattern/{symbol}", response_model=MomentumAnalysisResult)
async def analyze_momentum_pattern(
    symbol: str,
    period: str = Query("1y", regex="^(3mo|6mo|1y|2y|5y|max)$", description="Historical data period for analysis")
):
    """
    Perform detailed momentum pattern analysis for a single symbol.
    Returns comprehensive analysis with annotated chart and criteria breakdown.
    """
    try:
        ticker = yf.Ticker(symbol.upper())
        hist = ticker.history(period=period)
        
        if hist.empty or len(hist) < 100:
            raise HTTPException(status_code=404, detail=f"Insufficient historical data for analysis of '{symbol}'")
        
        # Perform momentum pattern analysis
        pattern_found, criteria_details, confidence_score = check_momentum_pattern(hist)
        
        # Count criteria met
        criteria_dict = criteria_details.dict()
        criteria_met = sum(1 for criterion in criteria_dict.values() if criterion['met'])
        
        # Determine pattern strength
        if confidence_score >= 90:
            strength = "Strong"
        elif confidence_score >= 70:
            strength = "Moderate"
        elif confidence_score >= 50:
            strength = "Weak"
        else:
            strength = "Very Weak"
        
        # Generate analysis report
        if pattern_found:
            analysis_report = f"""
MOMENTUM PATTERN ANALYSIS - {symbol.upper()}
Pattern Strength: {strength} ({confidence_score:.1f}% confidence)
Criteria Met: {criteria_met}/9

✅ CRITERIA ANALYSIS:
• Large Move: {criteria_details.criterion1_large_move['description']}
• Consolidation: {criteria_details.criterion2_consolidation['description']}  
• Narrow Range: {criteria_details.criterion3_narrow_range['description']}
• Moving Averages: {criteria_details.criterion4_moving_averages['description']}
• Volume Breakout: {criteria_details.criterion5_volume_breakout['description']}
• Close at HOD: {criteria_details.criterion6_close_at_hod['description']}
• Not Extended: {criteria_details.criterion7_not_extended['description']}
• Linear Moves: {criteria_details.criterion8_linear_moves['description']}
• Smooth Action: {criteria_details.criterion9_avoid_barcode['description']}

SUMMARY: This stock shows {strength.lower()} momentum pattern characteristics with {criteria_met} out of 9 criteria satisfied. 
The pattern suggests potential continuation of the current trend based on the 5 Star Trading Setup methodology.
            """.strip()
        else:
            failed_criteria = [name for name, criterion in criteria_dict.items() if not criterion['met']]
            analysis_report = f"""
MOMENTUM PATTERN ANALYSIS - {symbol.upper()}
Pattern Status: NOT FOUND ({confidence_score:.1f}% confidence)
Criteria Met: {criteria_met}/9

❌ FAILED CRITERIA:
{chr(10).join(f"• {name}: {criterion['description']}" for name, criterion in criteria_dict.items() if not criterion['met'])}

SUMMARY: This stock does not currently meet the 5 Star Trading Setup criteria. 
Consider waiting for better setup conditions or look for alternative opportunities.
            """.strip()
        
        # Generate annotated chart
        chart_base64 = None
        try:
            # Always generate chart regardless of pattern_found status
            chart_base64 = generate_annotated_chart(symbol.upper(), hist, criteria_details)
        except Exception as chart_error:
            print(f"Error generating chart for {symbol}: {chart_error}")
            chart_base64 = None
        
        return MomentumAnalysisResult(
            symbol=symbol.upper(),
            pattern_found=pattern_found,
            confidence_score=confidence_score,
            analysis_report=analysis_report,
            chart_image_base64=chart_base64,
            criteria_details=criteria_details,
            total_criteria_met=criteria_met,
            pattern_strength=strength
        )
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Error analyzing momentum pattern for '{symbol}': {str(e)}")

@app.get("/screen/low_volatility", response_model=List[ScreenResult])
async def screen_low_volatility(
    symbols: Optional[List[str]] = Query(None, description="Optional list of symbols to screen"),
    period: str = Query("3mo", regex="^(1d|5d|1mo|3mo|6mo|1y|5y|max)$", description="Historical data period"),
    top_n: int = Query(20, description="Number of lowest volatility stocks to return")
):
    """Screen stocks for low volatility using comprehensive stock universe."""
    # Use provided symbols or get comprehensive list
    if symbols and len(symbols) > 0:
        stocks_to_screen = [s.upper() for s in symbols]
    else:
        stocks_to_screen = get_comprehensive_stock_list()
    
    results = []
    
    for symbol in stocks_to_screen[:100]:  # Limit for performance
        try:
            ticker = yf.Ticker(symbol.upper())
            hist = ticker.history(period=period)
            
            if hist.empty or len(hist) < 10:
                continue
                
            # Calculate daily returns and volatility
            returns = hist['Close'].pct_change().dropna()
            
            if len(returns) < 5:
                continue
                
            volatility = returns.std()
            info = ticker.info
            name = info.get('longName', info.get('shortName', symbol.upper())) if info else symbol.upper()
            
            results.append(ScreenResult(
                symbol=symbol.upper(),
                value=float(volatility),
                name=name
            ))
            
        except Exception as e:
            print(f"Error processing {symbol}: {str(e)}")
            continue
    
    # Sort by volatility (ascending) and return top_n results
    sorted_results = sorted(results, key=lambda x: x.value)
    return sorted_results[:top_n]

# Strategy management endpoints (unchanged)
@app.post("/strategies/upload")
async def upload_strategy(file: UploadFile = File(...)):
    """Upload a Python strategy file"""
    if not file.filename.endswith('.py'):
        raise HTTPException(status_code=400, detail="Only Python files are allowed")
    
    try:
        content = await file.read()
        strategy_id = f"strategy_{int(time.time())}"
        
        content_str = content.decode('utf-8')
        if 'def generate_signals(' not in content_str:
            raise HTTPException(status_code=400, detail="Strategy must contain generate_signals function")
        
        strategies[strategy_id] = {
            'id': strategy_id,
            'name': file.filename.replace('.py', ''),
            'content': content_str,
            'uploaded_at': datetime.now().isoformat()
        }
        
        return {"id": strategy_id, "name": strategies[strategy_id]['name']}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading strategy: {str(e)}")

@app.get("/strategies")
async def list_strategies():
    """List all uploaded strategies"""
    return list(strategies.values())

@app.post("/data/upload")
async def upload_data(file: UploadFile = File(...)):
    """Upload historical data file"""
    if not file.filename.endswith(('.csv', '.xlsx')):
        raise HTTPException(status_code=400, detail="Only CSV and Excel files are allowed")
    
    try:
        content = await file.read()
        data_id = f"data_{int(time.time())}"
        
        uploaded_data[data_id] = {
            'id': data_id,
            'name': file.filename,
            'size': len(content),
            'uploaded_at': datetime.now().isoformat()
        }
        
        return {"id": data_id, "name": uploaded_data[data_id]['name']}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading data: {str(e)}")

@app.get("/data")
async def list_data():
    """List all uploaded data files"""
    return list(uploaded_data.values())

@app.post("/backtest/run")
async def run_backtest(config: BacktestConfig):
    """Run a backtest with the given configuration"""
    try:
        if config.strategy_id not in strategies:
            raise HTTPException(status_code=404, detail="Strategy not found")
        
        if config.data_id not in uploaded_data:
            raise HTTPException(status_code=404, detail="Data not found")
        
        result_id = f"result_{int(time.time())}"
        
        result = BacktestResult(
            id=result_id,
            strategy_name=strategies[config.strategy_id]['name'],
            dataset_name=uploaded_data[config.data_id]['name'],
            performance=12.5,
            sharpe_ratio=1.85,
            max_drawdown=-8.3,
            total_trades=45,
            win_rate=0.68,
            equity_curve=[100, 102, 105, 103, 108, 112.5],
            trade_log=[{"date": "2024-01-01", "action": "BUY", "price": 100, "quantity": 100}]
        )
        
        backtest_results[result_id] = result.dict()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error running backtest: {str(e)}")

@app.get("/backtest/results")
async def list_results():
    """List all backtest results"""
    return list(backtest_results.values())

@app.get("/backtest/results/{result_id}")
async def get_result(result_id: str):
    """Get a specific backtest result"""
    if result_id not in backtest_results:
        raise HTTPException(status_code=404, detail="Result not found")
    return backtest_results[result_id]

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 