import requests
import time
import os

LINDAS_ENDPOINT = "https://lindas.admin.ch/query"
GEO_ENDPOINT = "https://geo.ld.admin.ch/query"
OUTPUT_FILE = "rdf/processed/areas.ttl"

# Logs for tracking what succeeds, what fails, and what has no data
FAILED_LOG = "rdf/processed/failed_geometries.log"
EMPTY_LOG = "rdf/processed/empty_results.log"

def get_administrative_uris():
    """Step 1: Fetch the list of all administrative URIs from LINDAS."""
    print("Fetching URIs from LINDAS...")
    query = """
    PREFIX ch: <https://schema.ld.admin.ch/>
    SELECT ?place WHERE {
      ?place a ?type .
      VALUES ?type { ch:Canton ch:District ch:Municipality }
    }
    """
    resp = requests.post(LINDAS_ENDPOINT, data={"query": query}, headers={"Accept": "application/sparql-results+json"})
    resp.raise_for_status()
    return [f"<{b['place']['value']}>" for b in resp.json()["results"]["bindings"]]

def fetch_atomic():
    """Step 2: Fetch geometries one by one to prevent server overload."""
    uris = get_administrative_uris()
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    
    # 'identity' forces the server to send uncompressed text, 
    # preventing the ZstdError if the server drops the connection mid-stream.
    headers = {
        "Accept": "text/turtle",
        "Accept-Encoding": "identity" 
    }

    # The corrected query template with the xsd prefix included
    query_template = """
    PREFIX geo: <http://www.opengis.net/ont/geosparql#>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX schema: <http://schema.org/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    CONSTRUCT { ?geometry geo:asWKT ?wkt . }
    WHERE {
        ?placeInTime a geo:Feature ; 
            geo:defaultGeometry ?geometry ;
            dcterms:isVersionOf / schema:about %s .
        ?geometry geo:asWKT ?wkt .
        ?placeInTime dcterms:issued "2026-01-01"^^xsd:date .
    }
    """

    print(f"Starting atomic extraction ({len(uris)} units). This will be slow but stable.")

    # Open output and log files in append mode
    with open(OUTPUT_FILE, "a", encoding="utf-8") as out, \
         open(FAILED_LOG, "a", encoding="utf-8") as f_log, \
         open(EMPTY_LOG, "a", encoding="utf-8") as e_log:
        
        for i, uri in enumerate(uris):
            print(f"[{i+1}/{len(uris)}] {uri}...", end=" ", flush=True)
            
            try:
                response = requests.post(
                    GEO_ENDPOINT, 
                    data={"query": query_template % uri}, 
                    headers=headers, 
                    timeout=60,
                    stream=True
                )
                
                if response.status_code == 200:
                    content = response.text.strip()
                    
                    # Ensure we actually got a geometry triple back, not just prefixes
                    if "geo:asWKT" in content:
                        out.write(content + "\n\n")
                        print(f"DONE ({len(content)} bytes)")
                    else:
                        print("EMPTY (No match for this date/URI)")
                        e_log.write(f"{uri}\n")
                        
                else:
                    # Print the exact SPARQL error returned by the server for easier debugging
                    error_msg = response.text.strip()[:150] 
                    print(f"HTTP {response.status_code}: {error_msg}")
                    f_log.write(f"{uri} - HTTP {response.status_code}: {error_msg}\n")
            
            except requests.exceptions.RequestException as e:
                print(f"CRASHED ({type(e).__name__})")
                f_log.write(f"{uri} - Connection Drop ({type(e).__name__})\n")
            
            # Flush logs to disk immediately so you don't lose data if you ctrl+c
            f_log.flush()
            e_log.flush()
            out.flush()
            
            # Brief pause to respect the server limits
            time.sleep(0.2)

if __name__ == "__main__":
    fetch_atomic()