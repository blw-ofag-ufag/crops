# ==============================================================================
# R SCRIPT: Download (Paged), Unzip, and Read Thurgau (TG) 2024 Land Use Data
# ==============================================================================

library(sf)
library(rdfhelper)

# --- Configuration ---
output_file <- "rdf/geodata.ttl"
base_url <- "https://geodienste.ch/db/lwb_nutzungsflaechen_v2_0_0/deu/ogcapi/collections/nutzungsflaechen/items"

# Prefix Definitions
base <- "https://agriculture.ld.admin.ch/crops/"
cultivation <- paste0(base, "cultivation/")
cultivationtype <- paste0(base, "cultivationtype/")
geosparql <- "http://www.opengis.net/ont/geosparql#"

# Pagination Settings
limit <- 10000         # Max allowed by server
target_batches <- 20   # 20 * 10,000 = 200,000 items

# --- Initialize Output File ---
# We create/overwrite the file initially to ensure it's empty
file.create(output_file)

# --- Main Loop ---
for (batch in 0:(target_batches - 1)) {
  
  # Calculate offset
  offset <- batch * limit
  
  # Construct URL with limit and offset
  # Note: f=json is standard OGC API Features
  request_url <- paste0(base_url, "?f=json&limit=", limit, "&offset=", offset)
  
  message(paste("Fetching batch:", batch + 1, "| Offset:", offset, "| URL:", request_url))
  
  # Fetch data (Try-catch is good practice for network requests)
  gdf_chunk <- tryCatch({
    st_read(request_url, quiet = TRUE)
  }, error = function(e) {
    message("Error fetching data: ", e$message)
    return(NULL)
  })
  
  # Check if we got data
  if (is.null(gdf_chunk) || nrow(gdf_chunk) == 0) {
    message("No more data received. Stopping.")
    break
  }
  
  message(paste("  > Processing", nrow(gdf_chunk), "rows..."))
  
  # --- Write to File (Append Mode) ---
  # We open the sink only when writing triples, so console messages don't end up in the file
  sink(output_file, append = TRUE)
  
  for(i in 1:nrow(gdf_chunk)) {
    subject <- rdfhelper::uri(gdf_chunk$nutzungsidentifikator[i], cultivation)
    
    rdfhelper::triple(subject, "a", rdfhelper::uri("Cultivation", base))
    
    rdfhelper::triple(
      subject,
      rdfhelper::uri("cultivationtype", base),
      rdfhelper::uri(gdf_chunk$lnf_code[i], cultivationtype)
    )
    
    rdfhelper::triple(
      subject,
      rdfhelper::uri("asWKT", geosparql),
      rdfhelper::typed(st_as_text(gdf_chunk$geometry[i]), "wktLiteral")
    )
    
    rdfhelper::triple(
      subject,
      rdfhelper::uri("area_m2", base),
      gdf_chunk$flaeche_m2[i]
    )
  }
  
  # Close sink to save this batch
  sink()
  
  # Efficiency check: If we received fewer items than the limit, 
  # we have reached the end of the dataset.
  if (nrow(gdf_chunk) < limit) {
    message("Reached end of available data.")
    break
  }
}

message("Processing complete.")