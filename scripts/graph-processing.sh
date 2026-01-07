# Load environment variables from .env file
. ./.env

# Install any missing R packages
Rscript scripts/R/packages.R

# EPPO data integration
Rscript scripts/R/eppo.R

# Install any missing python packages
pip install -r scripts/Python/requirements.txt

# Process RDF files using Python scrips
python3 scripts/Python/reason.py rdf/ontology.ttl rdf/cultivationtypes.ttl rdf/taxa.ttl rdf/programs.ttl rdf/agis.ttl

echo "Delete existing data from LINDAS"
curl \
  --user $USER:$PASSWORD \
  -X DELETE \
  "$ENDPOINT?graph=$GRAPH"

# Ask whether or not to generate and upload geodata, which takes 10-15 minutes
read -r -p $'Do you want to generate and upload geodata.ttl?\n(This could take up to 15 minutes.)\n(y/n) ' answer

if [[ "$answer" == "y" || "$answer" == "Y" ]]; then

    echo "Generate geodata.ttl..."

    # Convert geodata
    python3 scripts/Python/geodata-rdf-integration.py

    # Upload geodata.ttl
    echo "Upload geodata.ttl..."
    gzip -c rdf/geodata.ttl | \
    curl \
      --user $USER:$PASSWORD \
      -X POST \
      -H "Content-Type: text/turtle" \
      -H "Content-Encoding: gzip" \
      --data-binary @- \
      "$ENDPOINT?graph=$GRAPH"
fi

echo "Upload crops ontology"
curl \
  --user $USER:$PASSWORD \
  -X POST \
  -H "Content-Type: text/turtle" \
  --data-binary @rdf/graph.ttl \
  "$ENDPOINT?graph=$GRAPH"

echo "Finished data upload"
