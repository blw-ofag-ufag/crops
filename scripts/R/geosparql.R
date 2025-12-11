# ==============================================================================
# R SCRIPT: Download (Paged), Unzip, and Read Thurgau (TG) 2024 Land Use Data
# ==============================================================================

library(sf)
library(rdfhelper)

# Read data
# The source is Swiss LV95 (EPSG: 2056). 
message("Reading and transforming data...")
data <- sf::st_read("data/data.gpkg", layer = "nutzungsflaechen", quiet = TRUE)

# Transform CRS to WGS 84 (EPSG: 4326) for GeoSPARQL compliance
# This converts the Swiss coordinates to Longitude/Latitude
data <- sf::st_transform(data, 4326)

# Filter only some cantons
# data <- subset(data, subset = kanton %in% c("TG"))


# Prefix Definitions
base <- "https://agriculture.ld.admin.ch/crops/"
cultivation <- paste0(base, "cultivation/")
cultivationtype <- paste0(base, "cultivationtype/")
programs <- paste0(base, "program/")
farms <- paste0(base, "farm/")
geosparql <- "http://www.opengis.net/ont/geosparql#"

# Get cantons
message("Fetching canton data via SPARQL...")
cantons <- sparql('
PREFIX ch: <https://schema.ld.admin.ch/>
PREFIX schema: <http://schema.org/>
SELECT * WHERE {
  ?canton a ch:Canton ; schema:alternateName ?code .
}
', 'https://lindas.admin.ch/query')

# Create a new file
# Note: sink() captures stdout, so we must print progress to stderr
sink("rdf/geodata.ttl")

# We calculate the total iterations for the main loop
n_total <- nrow(data)
message(paste("Processing", n_total, "rows..."))

# Initialize the progress bar. 
# file = stderr() is CRITICAL here so the bar prints to console, not the .ttl file
pb <- txtProgressBar(min = 0, max = n_total, style = 3, file = stderr())

# Loop over data
for (i in seq_len(n_total)) {

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
  triple(subject, uri("trees", base), x$anzahl_baeume)

  # Management unit
  triple(subject, uri("managementUnit", base), uri(x$identifikator_be, farms))

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
  
  # --- UPDATE PROGRESS BAR ---
  setTxtProgressBar(pb, i)
}

# Close the progress bar
close(pb)

# Handle the secondary loop (Farms)
# We can print a quick message to stderr so the user knows we aren't stuck
message("Processing unique management units...", domain = NA, appendLF = TRUE)

unique_farms <- unique(data$identifikator_be)

for (i in unique_farms) {
  triple(uri(i, farms), "a", uri("ManagementUnit", base))
}

sink()
message("Done! File saved to rdf/geodata.ttl")