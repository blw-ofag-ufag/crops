import pytest
import requests
import csv
import io
from rdflib import Graph

# Configuration
RDF_FILE_PATH = "./rdf/data/srppp.ttl"
CSV_URL = "https://raw.githubusercontent.com/BLV-OSAV-USAV/PSMV-RDF/refs/heads/main/data/raw/Code.csv"

def test_culture_hierarchy_exists_in_rdf():
    """
    Tests that every (ID, PARENT_ID) combination for TEXT_KEY == 'Culture' 
    in the remote CSV exists in the local RDF graph.
    """
    
    # ==========================================
    # 1. Fetch and process the remote CSV data
    # ==========================================
    try:
        response = requests.get(CSV_URL, timeout=10)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        pytest.fail(f"Failed to download CSV from {CSV_URL}\nError: {e}")

    # Parse the CSV and mirror the R `subset` logic
    csv_pairs = set()
    reader = csv.DictReader(io.StringIO(response.text))
    
    for row in reader:
        if row.get("TEXT_KEY") == "Culture":
            # Extract and clean the strings to avoid whitespace mismatch issues
            c_id = str(row.get("ID", "")).strip()
            c_parent_id = str(row.get("PARENT_ID", "")).strip()
            
            # Only add if both fields are populated
            if c_id and c_parent_id:
                csv_pairs.add((c_id, c_parent_id))
                
    if not csv_pairs:
        pytest.fail("The CSV filter returned 0 results. Check if the CSV structure or TEXT_KEY changed.")

    # ==========================================
    # 2. Parse the RDF file and run SPARQL
    # ==========================================
    g = Graph()
    try:
        g.parse(RDF_FILE_PATH, format="turtle")
    except Exception as e:
        pytest.fail(f"Failed to parse the local RDF file at {RDF_FILE_PATH}\nError: {e}")

    sparql_query = """
    PREFIX cube: <https://cube.link/>
    PREFIX schema: <http://schema.org/>
    SELECT ?id ?parent_id
    WHERE {
      [
        a cube:Observation ;
        schema:identifier ?id ;
        schema:isPartOf / schema:identifier ?parent_id ;
      ]
    }
    """
    
    rdf_pairs = set()
    for row in g.query(sparql_query):
        # Convert rdflib Literal/URIRef objects to standard Python strings for direct comparison
        r_id = str(row.id).strip()
        r_parent_id = str(row.parent_id).strip()
        rdf_pairs.add((r_id, r_parent_id))

    # ==========================================
    # 3. Validation and Error Reporting
    # ==========================================
    missing_pairs = []
    
    for csv_id, csv_parent_id in csv_pairs:
        if (csv_id, csv_parent_id) not in rdf_pairs:
            missing_pairs.append((csv_id, csv_parent_id))
            
    # If the missing_pairs list isn't empty, fail the test with a detailed message
    if missing_pairs:
        error_msg = (
            f"Found {len(missing_pairs)} 'Culture' combinations in the CSV "
            f"that are MISSING from the RDF graph ({RDF_FILE_PATH}).\n\n"
            "Sample of missing (ID, PARENT_ID) combinations:\n"
        )
        
        # Limit to first 20 to avoid flooding the console output on massive failures
        for m_id, m_parent in missing_pairs[:20]:
            error_msg += f"  → ID: {m_id} | PARENT_ID: {m_parent}\n"
            
        if len(missing_pairs) > 20:
            error_msg += f"  ... and {len(missing_pairs) - 20} more."
            
        pytest.fail(error_msg)