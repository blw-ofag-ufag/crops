# Load environment variables from .env file
. ./.env

# Install any missing R packages
Rscript scripts/R/packages.R

# EPPO data integration
Rscript scripts/R/eppo.R

# Install any missing python packages
pip install -r scripts/Python/requirements.txt

# Process RDF files using Python scrips
python3 scripts/Python/reason.py rdf/ontology.ttl rdf/cultivationtypes.ttl rdf/taxa.ttl

# Convert geodata
python3 scripts/Python/geodata-rdf-integration.py

echo "Delete existing data from LINDAS"
curl \
  --user $USER:$PASSWORD \
  -X DELETE \
  "$ENDPOINT?graph=$GRAPH"

echo "Upload new data to LINDAS"
curl \
  --user $USER:$PASSWORD \
  -X POST \
  -H "Content-Type: text/turtle" \
  --data-binary @rdf/graph.ttl \
  "$ENDPOINT?graph=$GRAPH"

gzip -c rdf/geodata.ttl | \
curl \
  --user $USER:$PASSWORD \
  -X POST \
  -H "Content-Type: text/turtle" \
  -H "Content-Encoding: gzip" \
  --data-binary @- \
  "$ENDPOINT?graph=$GRAPH"

echo "Finished data upload"
