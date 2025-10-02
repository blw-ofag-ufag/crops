#' =============================================================================
#'       title:  AGIS CROP TABLE CONVERSION TO RDF
#'      author:  Damian Oswald
#'        date:  2025-09-18
#' description:  Script to convert an Excel table of AGIS masterdata to RDF for
#'               subsequent publication on LINDAS and integration with other
#'               crop data.
#' =============================================================================

#' Attach libraries to search path
library(rdfhelper)
library(dplyr)

#' read helper functions
source("scripts/R/helper.R")

#' Constants
languages <- c("de", "fr", "it")

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

#' Create a new crops turtle file
sink("rdf/agis.ttl")


#' =============================================================================
#' WRITE CROP CATEGORIES
#' =============================================================================

colnames <- paste("Hauptkategorie", toupper(languages), sep = "_")
categories <- data %>%
  filter(if_all(all_of(colnames), ~ .x != "NULL")) %>%
  subset(select = colnames) %>%
  unique()
categories$code <- NA
categories$uri <- NA

for (i in seq_len(nrow(categories))) {

  code <- i + 100
  categories[i, "code"] <- code
  subject <- rdfhelper::uri(code, prefix = base)
  categories[i, "uri"] <- subject

  rdfhelper::triple(
    subject,
    "a",
    uri(c("CultivationType", "CultivationTypeCategory"), base)
  )
  for (lang in languages) {
    rdfhelper::triple(
      subject = subject,
      predicate = rdfhelper::uri("name", schema),
      object = rdfhelper::langstring(
        x = categories[i, paste("Hauptkategorie", toupper(lang), sep = "_")],
        lang = lang
      )
    )
  }
  x <- subset(
    data,
    subset = Hauptkategorie_DE == unlist(categories[i, "Hauptkategorie_DE"]),
    select = "LNF_Code"
  ) %>% unlist()
  rdfhelper::triple(subject, uri("hasPart", schema), uri(x, prefix = base))
}


#' =============================================================================
#' TABLE TO RDF CONVERSION
#' =============================================================================

for (i in seq_len(nrow(data))) {

  code <- as.integer(data[i, "LNF_Code"])
  subject <- rdfhelper::uri(code, prefix = base)
  rdfhelper::triple(subject, "a", rdfhelper::uri("CultivationType", base))
  rdfhelper::triple(subject, "a", rdfhelper::uri("DirectPaymentCrop", base))
  for (lang in languages) {
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

  construct_code(subject, code, "LNF")

  #' assign crop category by looking up value in LUT
  triple(
    subject = subject,
    predicate = uri("isPartOf", schema),
    object =  subset(
      x = categories,
      subset = Hauptkategorie_DE == data[i, ][["Hauptkategorie_DE"]],
      select = "uri"
    ) %>% unlist()
  )

}

sink()
