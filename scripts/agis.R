#' =============================================================================
#'       title:  AGIS CROP TABLE CONVERSION TO RDF
#'      author:  Damian Oswald
#'        date:  2025-09-18
#' =============================================================================

library(rdfhelper)

#' =============================================================================
#' DOWNLOAD DATA
#' =============================================================================

base_url <- "https://www.blw.admin.ch/dam/de/sd-web/bkAU6T83hyLT"
filename <- "LWB_Nutzungsfl%C3%A4chen_Kataloge.xlsx"
destfile <- tempfile(fileext = ".xlsx")
download.file(file.path(base_url, filename), destfile, mode = "wb")
data <- readxl::read_excel(destfile, sheet = 1)

#' =============================================================================
#' PREFIX DEFINITION
#' =============================================================================

base <- "https://agriculture.ld.admin.ch/crops/"
schema  <- "http://schema.org/"

#' =============================================================================
#' TABLE TO RDF CONVERSION
#' =============================================================================

sink("rdf/crops.ttl")

for (i in seq_len(nrow(data))) {
  code <- as.integer(data[i, "LNF_Code"])
  subject <- rdfhelper::uri(code, prefix = base)
  rdfhelper::triple(subject, "a", rdfhelper::uri("CropGroup", base))
  for (lang in c("de", "fr", "it")) {
    rdfhelper::triple(
      subject = subject,
      predicate = rdfhelper::uri("name", schema),
      object = rdfhelper::langstring(
        x = data[i, paste0("Nutzung_", toupper(lang))],
        lang = lang
      )
    )
  }

  keys <- c(Spezialkultur = "SpecialtyCrop", BFF_QI = "BFFQ1")
  for (j in seq_along(keys)) {
    if (as.integer(data[i, names(keys[j])]) == 1) {
      rdfhelper::triple(subject, "a", rdfhelper::uri(keys[j], base))
    }
  }

  keys <- c(
    Gueltig_Von = rdfhelper::uri("validFrom", schema),
    Gueltig_Bis = rdfhelper::uri("validTo", schema)
  )
  for (j in seq_along(keys)) {
    x <- as.integer(data[i, names(keys[j])])
    if (!is.na(x)) {
      rdfhelper::triple(subject, keys[j], rdfhelper::typed(x, "gYear"))
    }
  }

  rdfhelper::triple(
    subject,
    rdfhelper::uri("LNF", base),
    as.integer(data[i, "LNF_Code"])
  )
}

sink()
