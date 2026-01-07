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

# Inspect the hierarchy

[This hierarchy viewer allows you to visually inspect the hierarchical relationships.](https://blw-ofag-ufag.github.io/crops/hierarchy/index.html)

# Inspect the ontology

Inspect the ontology using WebVOWL [here](https://service.tib.eu/webvowl/#iri=https://raw.githubusercontent.com/blw-ofag-ufag/crops/refs/heads/main/rdf/ontology.ttl) or read its turtle file [here](https://raw.githubusercontent.com/blw-ofag-ufag/crops/refs/heads/main/rdf/ontology.ttl).

# Download geospatial data (OPTIONAL)

- Integration pipeline for <https://geodienste.ch> geometries using a fast Python script [geodata-rdf-integration.py](scripts/Python/geodata-rdf-integration.py)
- For data download and preparing integration:
  1. Go to <https://geodienste.ch>
  2. Select dataset *Nutzungsflächen*
  3. Click "Daten beziehen"
  4. Select "GeoPackage" and cantons you want.
  5. Download data, rename it as "data.gpkg" and move it into the data folder.
- Script automatically maps crops to ontology
- Before LINDAS upload, the geodata is compressed to make the upload about 10x faster

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
    pip install -r requirements.txt
    ```

2. Run the ETL pipeline.

    ``` sh
    sh scripts/graph-processing.sh
    ```

3. Choose whether or not to generate and upload `geodata.ttl`, which enables queries and depiction of crop areas. 
4. Check out the results on LINDAS.

# Data mapping and unification

Data about crops is often sourced from various systems, which can lead to duplicate entries for the same real-world concept. To create a clean and unified dataset, we employ a mapping process to consolidate these duplicates.

This consolidation is defined in the `rdf/mapping.ttl` file. It uses the standard OWL property `owl:sameAs` to declare that two URIs refer to the same entity.

For example, consider the following statement:

```ttl
@prefix : <https://agriculture.ld.admin.ch/crops/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .

:950 owl:sameAs :555 .
```

This statement establishes `:950` as the canonical (master) URI and `:555` as the duplicate. During the data integration pipeline, the `scripts/reason.py` script processes this mapping.
In this example, all triples that use `:555` as a subject or object are automatically rewritten to use `:950` instead.
Crucially, to avoid conflicting information, the canonical entity `:950` first loses all its properties for names and descriptions (specifically `schema:name` and `schema:description`).
This ensures that the descriptive properties from the merged entity (`:555`) are cleanly transferred, creating a single, consistent record for the crop under the URI `:950`.

# Explore the graph on LINDAS

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

If you have chosen to include geospatial data during the running of the graph-processing.sh pipeline, you can [query the graph for multipolygons](https://s.zazuko.com/36J1nA6) of crop areas and depict them in a map using a query like this:

```sparql
PREFIX schema: <http://schema.org/>
PREFIX geosparql: <http://www.opengis.net/ont/geosparql#>
PREFIX : <https://agriculture.ld.admin.ch/crops/>
PREFIX canton: <https://ld.admin.ch/canton/>
SELECT *
FROM <https://lindas.admin.ch/foag/crops>
WHERE {
  ?cultivation :cultivationtype / :partOf* / schema:name "Leguminosen"@de ;
    geosparql:asWKT ?geometry ;
    :canton canton:1 .
}
```

![](https://github.com/user-attachments/assets/cc1cf3a1-b639-4915-9f59-167aad3c839f)

More queries can be found in the `~/queries/` folder.
