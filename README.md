# RDF master and reference data about crops

In this project, we propose a unified master data system for crops and crop-related objects.

# Inspect the ontology

Inspect the ontology using WebVOWL [here](https://service.tib.eu/webvowl/#iri=https://raw.githubusercontent.com/blw-ofag-ufag/crops/refs/heads/main/rdf/ontology.ttl) or read its turtle file [here](https://raw.githubusercontent.com/blw-ofag-ufag/crops/refs/heads/main/rdf/ontology.ttl).

# Run data integration pipeline

The data integration pipeline uses all the R and python scripts in the `/scripts` folder. The entire pipeline can be triggered with:

1. Add variables to `.env`

    ```sh
    USER=lindas-foag
    PASSWORD=********
    GRAPH=https://lindas.admin.ch/foag/crops
    ENDPOINT=https://stardog.cluster.ldbar.ch/lindas
    ```

2. Run the ETL pipeline `sh scripts/etl.sh`
3. Check out the results on LINDAS.

# Example queries

You can query the crop master data system using SPARQL.

Here's an [example SPARQL query](https://s.zazuko.com/2SyHoth) that gets you all cultivation type URIs and labels in German:

```sparql
PREFIX schema: <http://schema.org/>
PREFIX : <https://agriculture.ld.admin.ch/crops/>
SELECT *
WHERE {
  ?crop a :CultivationType .
  ?crop schema:name ?name .
  FILTER(LANG(?name)="de")
}
ORDER BY ?name
```