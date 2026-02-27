#!/bin/bash
source .env

# Convert geodata (this might take a long time, up to 30 min)
python scripts/Python/geodata-rdf-integration.py

# Upload geodata.ttl (might also take longer)
echo "Upload geodata.ttl..."
gzip -c rdf/geodata.ttl | \
curl \
    --user $USER:$PASSWORD \
    -X POST \
    -H "Content-Type: text/turtle" \
    -H "Content-Encoding: gzip" \
    --data-binary @- \
    "$ENDPOINT?graph=$GRAPH"