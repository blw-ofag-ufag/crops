# RDF master and reference data about crops

This project addresses the challenge of fragmented agricultural crop data within the Swiss federal administration, where essential systems[^1] all use separate, non-harmonized crop terminologies.
This lack of a "single source of truth" creates significant integration hurdles for digital tools.

In this project, we propose a unified master data system for crops and crop-related objects.
The repository implements a sustainable solution by using a dedicated RDF ontology (crops ontology) and a graph database on LINDAS.
This approach first connects (or "maps") the various crop terms from the different systems, creating a unified, machine-readable master data system that can be queried centrally.
This graph not only allows for complex queries across formerly siloed data but also provides the stable, versioned foundation for the long-term, step-by-step harmonization of crop data across the Swiss agricultural sector.
[Click here to search for crops in the graph.](https://blw-ofag-ufag.github.io/crops/?lang=de&query=Reis)

> [!WARNING]
> This project is still work in progress.

[^1]: For example [AGIS (direct payments)](https://www.i14y.admin.ch/en/catalog/concepts/08dcabe2-1734-ca16-9dfe-262056c9c124/content), [GRUD (fertilization)](https://www.agroscope.admin.ch/agroscope/de/home/themen/pflanzenbau/ackerbau/grud.html), [PSM registry (plant protection)](https://www.psm.admin.ch/de/kulturen/bs/A), [ProVar (varieties)](https://www.blw.admin.ch/de/sortenschutz#Sortenschutzregister), [PGREL-NIS (gene bank)](https://www.blw.admin.ch/de/pgrel-nis) and others.

# Data model

The general data model is doumented [here](https://shacl-play.sparna.fr/play/doc?format=html_respec&url=https%3A%2F%2Fraw.githubusercontent.com%2Fblw-ofag-ufag%2Fcrops%2Frefs%2Fheads%2Fmain%2Frdf%2Fshape%2Fdata-model.ttl&includeDiagram=true&sectionDiagram=true). Note that *SHACL Play!* reads the data from `rdf/shape/data-model.ttl` on `main`.

You may inspect the crop taxonomy/ontology using WebVOWL [here](https://service.tib.eu/webvowl/#iri=https://raw.githubusercontent.com/blw-ofag-ufag/crops/refs/heads/main/rdf/processed/crop-taxonomy.ttl) or read its turtle file [here](https://raw.githubusercontent.com/blw-ofag-ufag/crops/refs/heads/main/rdf/ontology/cultivationtypes.ttl).

Alternatively, we have built a [hierarchy viewer that allows you to visually inspect the hierarchical relationships](https://blw-ofag-ufag.github.io/crops/hierarchy/index.html) of the crops.

> [!NOTE]
> You may find more information on the [repository wiki](https://github.com/blw-ofag-ufag/crops/wiki).

# Repository structure

- `/data`: source data files
- `/docs`: (static) html documents, rendered as github page
- `/rdf`: all RDF (turtle) files
  - `/data`: tabular data
  - `/ontology`: core vocabulary, crop taxonomy
  - `/processed`: any automatically written turtle files -- do not change (manually)
  - `/shape`: dedicated files for SHACL shapes
- `/src`: source code
- `/tests`: pytest files

# Run the data processing and LINDAS integration pipeline

The data integration pipeline uses all the R and python scripts in the `/scripts` folder. The entire pipeline can be triggered with:

1. Add variables to `.env`

    ```sh
    USER=lindas-foag
    PASSWORD=********
    GRAPH=https://lindas.admin.ch/foag/crops
    ENDPOINT=https://stardog.cluster.ldbar.ch/lindas
    EPPO=********
    ```

2. Start a virtual environment and install libraries:

    ``` sh
    python -m venv venv
    source venv/bin/activate  # On Windows use: venv\Scripts\activate
    pip install -r src/python/requirements.txt
    ```

3. Run the ETL pipeline `sh src/pipeline.bash`
4. Make sure you pass all tests with `pytest tests`
5. Check out the results on LINDAS.

# Explore the graph on LINDAS

You can query the crop master data system using SPARQL.

Here's an [example SPARQL query](https://lindas.admin.ch/sparql/#query=PREFIX%20schema%3A%20%3Chttp%3A%2F%2Fschema.org%2F%3E%0APREFIX%20owl%3A%20%3Chttp%3A%2F%2Fwww.w3.org%2F2002%2F07%2Fowl%23%3E%20%0APREFIX%20rdfs%3A%20%3Chttp%3A%2F%2Fwww.w3.org%2F2000%2F01%2Frdf-schema%23%3E%0APREFIX%20%3A%20%3Chttps%3A%2F%2Fagriculture.ld.admin.ch%2Fcrops%2F%3E%0A%0ASELECT%20%3Fname%20%3FURI%0AFROM%20%3Chttps%3A%2F%2Flindas.admin.ch%2Ffoag%2Fcrops%3E%0AWHERE%20%7B%0A%20%20%3FURI%20a%20owl%3AClass%20%3B%0A%20%20%20%20schema%3Aname%20%3Fname%20%3B%0A%20%20%20%20rdfs%3AsubClassOf%2B%20%3ACultivation%20.%0A%20%20FILTER(LANG(%3Fname)%20%3D%20%22de%22)%0A%7D%0AORDER%20BY%20%3Fname&endpoint=https%3A%2F%2Flindas.admin.ch%2Fquery&requestMethod=POST&tabTitle=Crops&headers=%7B%7D&contentTypeConstruct=application%2Fn-triples%2C*%2F*%3Bq%3D0.9&contentTypeSelect=application%2Fsparql-results%2Bjson%2C*%2F*%3Bq%3D0.9&outputFormat=table&outputSettings=%7B%22compact%22%3Atrue%7D) that gets you all cultivation type URIs and labels in German:

```sparql
PREFIX schema: <http://schema.org/>
PREFIX owl: <http://www.w3.org/2002/07/owl#> 
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX : <https://agriculture.ld.admin.ch/crops/>

SELECT ?name ?URI
FROM <https://lindas.admin.ch/foag/crops>
WHERE {
  ?URI a owl:Class ;
    schema:name ?name ;
    rdfs:subClassOf+ :Cultivation .
  FILTER(LANG(?name) = "de")
}
ORDER BY ?name
```