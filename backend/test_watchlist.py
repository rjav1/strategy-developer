"""
Test file for watchlist endpoints
"""
import pytest
import json
import os
from pathlib import Path
from fastapi.testclient import TestClient
from main import app

# Test client
client = TestClient(app)

# Test watchlist file path
TEST_WATCHLIST_FILE = Path("test_watchlist.json")

@pytest.fixture(autouse=True)
def setup_and_cleanup():
    """Setup and cleanup for each test"""
    # Clean up before test
    if TEST_WATCHLIST_FILE.exists():
        TEST_WATCHLIST_FILE.unlink()
    
    # Monkey patch the watchlist file path for testing
    import main
    original_file = main.WATCHLIST_FILE
    main.WATCHLIST_FILE = TEST_WATCHLIST_FILE
    
    yield
    
    # Clean up after test
    if TEST_WATCHLIST_FILE.exists():
        TEST_WATCHLIST_FILE.unlink()
    
    # Restore original file path
    main.WATCHLIST_FILE = original_file

def test_get_empty_watchlist():
    """Test getting an empty watchlist"""
    response = client.get("/watchlist")
    assert response.status_code == 200
    data = response.json()
    assert data["symbols"] == []

def test_add_symbol_to_watchlist():
    """Test adding a symbol to the watchlist"""
    response = client.post("/watchlist", json={"symbol": "AAPL"})
    assert response.status_code == 200
    data = response.json()
    assert "AAPL" in data["symbols"]

def test_add_multiple_symbols():
    """Test adding multiple symbols to the watchlist"""
    # Add first symbol
    response = client.post("/watchlist", json={"symbol": "AAPL"})
    assert response.status_code == 200
    
    # Add second symbol
    response = client.post("/watchlist", json={"symbol": "MSFT"})
    assert response.status_code == 200
    data = response.json()
    assert "AAPL" in data["symbols"]
    assert "MSFT" in data["symbols"]
    assert len(data["symbols"]) == 2

def test_add_duplicate_symbol():
    """Test adding a duplicate symbol (should not create duplicates)"""
    # Add symbol twice
    client.post("/watchlist", json={"symbol": "AAPL"})
    response = client.post("/watchlist", json={"symbol": "AAPL"})
    
    assert response.status_code == 200
    data = response.json()
    assert data["symbols"].count("AAPL") == 1

def test_add_lowercase_symbol():
    """Test adding a lowercase symbol (should be converted to uppercase)"""
    response = client.post("/watchlist", json={"symbol": "aapl"})
    assert response.status_code == 200
    data = response.json()
    assert "AAPL" in data["symbols"]
    assert "aapl" not in data["symbols"]

def test_add_empty_symbol():
    """Test adding an empty symbol (should fail)"""
    response = client.post("/watchlist", json={"symbol": ""})
    assert response.status_code == 400

def test_remove_symbol_from_watchlist():
    """Test removing a symbol from the watchlist"""
    # Add symbols first
    client.post("/watchlist", json={"symbol": "AAPL"})
    client.post("/watchlist", json={"symbol": "MSFT"})
    
    # Remove one symbol
    response = client.delete("/watchlist/AAPL")
    assert response.status_code == 200
    data = response.json()
    assert "AAPL" not in data["symbols"]
    assert "MSFT" in data["symbols"]

def test_remove_nonexistent_symbol():
    """Test removing a symbol that doesn't exist (should not fail)"""
    response = client.delete("/watchlist/NONEXISTENT")
    assert response.status_code == 200
    data = response.json()
    assert "NONEXISTENT" not in data["symbols"]

def test_watchlist_persistence():
    """Test that watchlist persists to file"""
    # Add a symbol
    client.post("/watchlist", json={"symbol": "AAPL"})
    
    # Check that file was created and contains the symbol
    assert TEST_WATCHLIST_FILE.exists()
    with open(TEST_WATCHLIST_FILE, 'r') as f:
        data = json.load(f)
        assert "AAPL" in data["symbols"]

def test_watchlist_loads_from_file():
    """Test that watchlist loads from existing file"""
    # Create a watchlist file manually
    test_data = {"symbols": ["AAPL", "MSFT", "GOOGL"]}
    with open(TEST_WATCHLIST_FILE, 'w') as f:
        json.dump(test_data, f)
    
    # Get watchlist (should load from file)
    response = client.get("/watchlist")
    assert response.status_code == 200
    data = response.json()
    assert set(data["symbols"]) == {"AAPL", "MSFT", "GOOGL"}

def test_case_insensitive_removal():
    """Test that symbol removal is case insensitive"""
    # Add symbol in uppercase
    client.post("/watchlist", json={"symbol": "AAPL"})
    
    # Remove in lowercase
    response = client.delete("/watchlist/aapl")
    assert response.status_code == 200
    data = response.json()
    assert "AAPL" not in data["symbols"]

if __name__ == "__main__":
    pytest.main([__file__, "-v"])