# ==============================================================================
# R SCRIPT: Download (Paged), Unzip, and Read Thurgau (TG) 2024 Land Use Data
# ==============================================================================

library(sf)
library(rdfhelper)

# 1. Read data
# The source is Swiss LV95 (EPSG: 2056). 
data <- sf::st_read("data/data.gpkg", layer = "nutzungsflaechen")

# 2. Transform CRS to WGS 84 (EPSG: 4326) for GeoSPARQL compliance
# This converts the Swiss coordinates to Longitude/Latitude
data <- sf::st_transform(data, 4326)

# Prefix Definitions
base <- "https://agriculture.ld.admin.ch/crops/"
cultivation <- paste0(base, "cultivation/")
cultivationtype <- paste0(base, "cultivationtype/")
geosparql <- "http://www.opengis.net/ont/geosparql#"

sink("rdf/geodata.ttl")

# loop over data
for (i in seq_len(nrow(data))) {
  
  # Extract geometry as WKT string from the transformed data
  # We use st_geometry() to be safe, regardless of what the column is named
  wkt_string <- sf::st_as_text(sf::st_geometry(data)[[i]])
  
  subject <- rdfhelper::uri(data$t_id[i], cultivation)
  
  rdfhelper::triple(subject, "a", rdfhelper::uri("Cultivation", base))
  
  rdfhelper::triple(
    subject,
    rdfhelper::uri("cultivationtype", base),
    rdfhelper::uri(data$lnf_code[i], cultivationtype)
  )
  
  # The wktLiteral will now contain standard WGS84 Lat/Long coordinates
  rdfhelper::triple(
    subject,
    rdfhelper::uri("asWKT", geosparql),
    rdfhelper::typed(wkt_string, "wktLiteral") 
  )
  
  rdfhelper::triple(
    subject,
    rdfhelper::uri("area_m2", base),
    data$flaeche_m2[i]
  )
  
  rdfhelper::triple(
    subject,
    rdfhelper::uri("trees", base),
    data$anzahl_baeume[i]
  )
}

sink()
