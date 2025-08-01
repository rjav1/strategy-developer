"""
Unit tests for multiple watchlists endpoints
"""
import pytest
import json
import os
from pathlib import Path
from fastapi.testclient import TestClient
from main import app

# Test client
client = TestClient(app)

# Test watchlists file path
TEST_WATCHLISTS_FILE = Path("test_watchlists.json")

@pytest.fixture(autouse=True)
def setup_and_cleanup():
    """Setup and cleanup for each test"""
    # Clean up before test
    if TEST_WATCHLISTS_FILE.exists():
        TEST_WATCHLISTS_FILE.unlink()
    
    # Monkey patch the watchlists file path for testing
    import main
    original_file = main.WATCHLISTS_FILE
    main.WATCHLISTS_FILE = TEST_WATCHLISTS_FILE
    
    yield
    
    # Clean up after test
    if TEST_WATCHLISTS_FILE.exists():
        TEST_WATCHLISTS_FILE.unlink()
    
    # Restore original file path
    main.WATCHLISTS_FILE = original_file

def test_get_empty_watchlists():
    """Test getting empty watchlists"""
    response = client.get("/watchlists")
    assert response.status_code == 200
    data = response.json()
    assert data["watchlists"] == []

def test_create_watchlist():
    """Test creating a new watchlist"""
    response = client.post("/watchlists", json={"name": "Tech Stocks"})
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Tech Stocks"
    assert data["symbols"] == []
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data

def test_create_duplicate_watchlist_name():
    """Test creating a watchlist with duplicate name (should fail)"""
    # Create first watchlist
    client.post("/watchlists", json={"name": "Tech Stocks"})
    
    # Try to create with same name
    response = client.post("/watchlists", json={"name": "Tech Stocks"})
    assert response.status_code == 400

def test_create_watchlist_case_insensitive():
    """Test that watchlist names are case insensitive"""
    # Create first watchlist
    client.post("/watchlists", json={"name": "Tech Stocks"})
    
    # Try to create with different case
    response = client.post("/watchlists", json={"name": "tech stocks"})
    assert response.status_code == 400

def test_add_symbol_to_watchlist():
    """Test adding a symbol to a watchlist"""
    # Create watchlist first
    create_response = client.post("/watchlists", json={"name": "Tech Stocks"})
    watchlist_id = create_response.json()["id"]
    
    # Add symbol
    response = client.post(f"/watchlists/{watchlist_id}/symbols", json={"symbol": "AAPL"})
    assert response.status_code == 200
    data = response.json()
    assert "AAPL" in data["symbols"]

def test_add_symbol_to_nonexistent_watchlist():
    """Test adding symbol to non-existent watchlist (should fail)"""
    response = client.post("/watchlists/nonexistent/symbols", json={"symbol": "AAPL"})
    assert response.status_code == 404

def test_add_empty_symbol():
    """Test adding empty symbol (should fail)"""
    # Create watchlist first
    create_response = client.post("/watchlists", json={"name": "Tech Stocks"})
    watchlist_id = create_response.json()["id"]
    
    # Try to add empty symbol
    response = client.post(f"/watchlists/{watchlist_id}/symbols", json={"symbol": ""})
    assert response.status_code == 400

def test_add_duplicate_symbol():
    """Test adding duplicate symbol (should not create duplicates)"""
    # Create watchlist and add symbol
    create_response = client.post("/watchlists", json={"name": "Tech Stocks"})
    watchlist_id = create_response.json()["id"]
    
    # Add symbol twice
    client.post(f"/watchlists/{watchlist_id}/symbols", json={"symbol": "AAPL"})
    response = client.post(f"/watchlists/{watchlist_id}/symbols", json={"symbol": "AAPL"})
    
    assert response.status_code == 200
    data = response.json()
    assert data["symbols"].count("AAPL") == 1

def test_remove_symbol_from_watchlist():
    """Test removing a symbol from a watchlist"""
    # Create watchlist and add symbols
    create_response = client.post("/watchlists", json={"name": "Tech Stocks"})
    watchlist_id = create_response.json()["id"]
    
    client.post(f"/watchlists/{watchlist_id}/symbols", json={"symbol": "AAPL"})
    client.post(f"/watchlists/{watchlist_id}/symbols", json={"symbol": "MSFT"})
    
    # Remove one symbol
    response = client.delete(f"/watchlists/{watchlist_id}/symbols/AAPL")
    assert response.status_code == 200
    data = response.json()
    assert "AAPL" not in data["symbols"]
    assert "MSFT" in data["symbols"]

def test_remove_symbol_from_nonexistent_watchlist():
    """Test removing symbol from non-existent watchlist (should fail)"""
    response = client.delete("/watchlists/nonexistent/symbols/AAPL")
    assert response.status_code == 404

def test_remove_nonexistent_symbol():
    """Test removing a symbol that doesn't exist (should not fail)"""
    # Create watchlist
    create_response = client.post("/watchlists", json={"name": "Tech Stocks"})
    watchlist_id = create_response.json()["id"]
    
    response = client.delete(f"/watchlists/{watchlist_id}/symbols/NONEXISTENT")
    assert response.status_code == 200

def test_delete_watchlist():
    """Test deleting a watchlist"""
    # Create watchlist
    create_response = client.post("/watchlists", json={"name": "Tech Stocks"})
    watchlist_id = create_response.json()["id"]
    
    # Delete watchlist
    response = client.delete(f"/watchlists/{watchlist_id}")
    assert response.status_code == 200
    
    # Verify it's gone
    response = client.get("/watchlists")
    data = response.json()
    assert len(data["watchlists"]) == 0

def test_delete_nonexistent_watchlist():
    """Test deleting non-existent watchlist (should fail)"""
    response = client.delete("/watchlists/nonexistent")
    assert response.status_code == 404

def test_watchlists_persistence():
    """Test that watchlists persist to file"""
    # Create watchlist
    response = client.post("/watchlists", json={"name": "Tech Stocks"})
    watchlist_id = response.json()["id"]
    
    # Add symbol
    client.post(f"/watchlists/{watchlist_id}/symbols", json={"symbol": "AAPL"})
    
    # Check that file was created and contains the data
    assert TEST_WATCHLISTS_FILE.exists()
    with open(TEST_WATCHLISTS_FILE, 'r') as f:
        data = json.load(f)
        assert len(data["watchlists"]) == 1
        assert data["watchlists"][0]["name"] == "Tech Stocks"
        assert "AAPL" in data["watchlists"][0]["symbols"]

def test_watchlists_load_from_file():
    """Test that watchlists load from existing file"""
    # Create a watchlists file manually
    test_data = {
        "watchlists": [
            {
                "id": "test123",
                "name": "Test Watchlist",
                "symbols": ["AAPL", "MSFT"],
                "created_at": "2023-01-01T00:00:00",
                "updated_at": "2023-01-01T00:00:00"
            }
        ]
    }
    with open(TEST_WATCHLISTS_FILE, 'w') as f:
        json.dump(test_data, f)
    
    # Get watchlists (should load from file)
    response = client.get("/watchlists")
    assert response.status_code == 200
    data = response.json()
    assert len(data["watchlists"]) == 1
    assert data["watchlists"][0]["name"] == "Test Watchlist"
    assert set(data["watchlists"][0]["symbols"]) == {"AAPL", "MSFT"}

def test_case_insensitive_symbol_operations():
    """Test that symbol operations are case insensitive"""
    # Create watchlist and add symbol in lowercase
    create_response = client.post("/watchlists", json={"name": "Tech Stocks"})
    watchlist_id = create_response.json()["id"]
    
    # Add symbol in lowercase
    response = client.post(f"/watchlists/{watchlist_id}/symbols", json={"symbol": "aapl"})
    assert response.status_code == 200
    data = response.json()
    assert "AAPL" in data["symbols"]  # Should be stored in uppercase
    
    # Remove in different case
    response = client.delete(f"/watchlists/{watchlist_id}/symbols/aapl")
    assert response.status_code == 200
    data = response.json()
    assert "AAPL" not in data["symbols"]

def test_multiple_watchlists():
    """Test creating and managing multiple watchlists"""
    # Create multiple watchlists
    wl1_response = client.post("/watchlists", json={"name": "Tech Stocks"})
    wl2_response = client.post("/watchlists", json={"name": "Energy Stocks"})
    
    wl1_id = wl1_response.json()["id"]
    wl2_id = wl2_response.json()["id"]
    
    # Add different symbols to each
    client.post(f"/watchlists/{wl1_id}/symbols", json={"symbol": "AAPL"})
    client.post(f"/watchlists/{wl2_id}/symbols", json={"symbol": "XOM"})
    
    # Verify both exist with correct symbols
    response = client.get("/watchlists")
    data = response.json()
    assert len(data["watchlists"]) == 2
    
    tech_wl = next(wl for wl in data["watchlists"] if wl["name"] == "Tech Stocks")
    energy_wl = next(wl for wl in data["watchlists"] if wl["name"] == "Energy Stocks")
    
    assert "AAPL" in tech_wl["symbols"]
    assert "XOM" in energy_wl["symbols"]

if __name__ == "__main__":
    pytest.main([__file__, "-v"])