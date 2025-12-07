# ==============================================================================
# R SCRIPT: Download (Paged), Unzip, and Read Thurgau (TG) 2024 Land Use Data
# ==============================================================================

library(sf)
library(rdfhelper)

# Read data
# The source is Swiss LV95 (EPSG: 2056). 
data <- sf::st_read("data/data.gpkg", layer = "nutzungsflaechen")

# Transform CRS to WGS 84 (EPSG: 4326) for GeoSPARQL compliance
# This converts the Swiss coordinates to Longitude/Latitude
data <- sf::st_transform(data, 4326)

# Filter only some cantons
data <- subset(data, subset = kanton %in% c("TG", "ZH"))

# Prefix Definitions
base <- "https://agriculture.ld.admin.ch/crops/"
cultivation <- paste0(base, "cultivation/")
cultivationtype <- paste0(base, "cultivationtype/")
programs <- paste0(base, "programs/")
geosparql <- "http://www.opengis.net/ont/geosparql#"

# Get cantons
cantons <- sparql('
PREFIX ch: <https://schema.ld.admin.ch/>
PREFIX schema: <http://schema.org/>
SELECT * WHERE {
  ?canton a ch:Canton ; schema:alternateName ?code .
}
', 'https://lindas.admin.ch/query')

# Create a new file
sink("rdf/geodata.ttl")

# Loop over data
for (i in seq_len(nrow(data))) {

  # select only the *i*th observation
  x <- data[i, ]
  
  # define subject IRI
  subject <- uri(x$t_id, cultivation)
  
  # class and cultivationtype assignment
  triple(subject, "a", uri("Cultivation", base))
  triple(subject, uri("cultivationtype", base), uri(x$lnf_code, cultivationtype))
  
  # Extract geometry as WKT string from the transformed data
  # We use st_geometry() to be safe, regardless of what the column is named
  triple(
    subject,
    uri("asWKT", geosparql),
    typed(sf::st_as_text(sf::st_geometry(x)), "wktLiteral") 
  )
  
  # Area
  triple(
    subject,
    uri("area", base),
    x$flaeche_m2
  )

  # Direct payment programmes
  # triple(subject, uri("program", base), uri(unlist(strsplit(x$code_programm, ";")), programs) )

  # Number of trees
  # triple(subject, uri("trees", base), x$anzahl_baeume)

  # Responsible canton
  triple(
    subject,
    uri("canton", base),
    uri(subset(cantons, subset = code==x$kanton, select = canton))
  )

  # Mowing Date
  triple(
    subject,
    uri("movingDate", base),
    typed(x$schnittzeitpunkt, "date")
  )
}

sink()
