# Load environment variables from .env file
. ./.env

# Install any missing python packages
pip install -r scripts/Python/requirements.txt

# Install any missing R packages
Rscript scripts/R/packages.R

# Run R processing steps
for r in agis grud srppp; do
  Rscript scripts/R/${r}.R
done

# Process RDF files using Python scrips
python3 scripts/Python/reason.py rdf/ontology.ttl rdf/agis.ttl rdf/srppp.ttl rdf/grud.ttl rdf/mapping.ttl

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
