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
source("src/r/helper.R")

#' Constants
languages <- c("de", "fr", "it")

#' =============================================================================
#' DOWNLOAD DATA
#' =============================================================================

data <- readxl::read_excel("data/agis-crops.xlsx", sheet = 3, na = "NA")

data <- data %>%
  mutate(
    CULTIVATIONTYPECATEGORY = case_match(
      CULTIVATIONTYPECATEGORY_DE,
      "Ackerfläche" ~ "1",
      "Dauergrünfläche" ~ "21",
      "Flächen ausserhalb der landwirtschaftlichen Nutzfläche" ~ "12",  #nolint
      "Weitere Flächen innerhalb der landwirtschaftlichen Nutzfläche" ~ "10", #nolint
      "Flächen im Sömmerungsgebiet" ~ "13",
      "Flächen mit Kulturen in ganzjährig geschütztem Anbau" ~ "7", #nolint
      "Andere Elemente" ~ "20",
      "Flächen mit Dauerkulturen" ~ NA_character_,
      .default = NA_character_
    )
  )

#' =============================================================================
#' PREFIX DEFINITION
#' =============================================================================

base <- "https://agriculture.ld.admin.ch/crops/"
cultivationtype <- paste0(base, "cultivationtype/")
schema  <- "http://schema.org/"

#' Create a new crops turtle file
sink("rdf/processed/agis.ttl")

#' =============================================================================
#' TABLE TO RDF CONVERSION
#' =============================================================================

for (i in seq_len(nrow(data))) {

  # Save ID/IRI for this object
  code <- as.character(data[i, "DIRECTPAYMENTCROP"])
  subject <- rdfhelper::uri(code, prefix = cultivationtype)

  # Static class assignment
  rdfhelper::triple(subject, "a", rdfhelper::uri("CultivationType", base))

  # Dynamic class assignment
  from <- as.character(as.Date(data$VALID_FROM)[i])
  to <- as.character(as.Date(data$VALID_TO)[i])
  construct_class_membership(
    subject,
    uri("DirectPaymentCrop", base),
    identifier = code,
    validFrom = from,
    validTo = to,
    name = "AGIS"
  )

  # Assign labels
  for (lang in languages) {
    rdfhelper::triple(
      subject = subject,
      predicate = rdfhelper::uri("name", schema),
      object = rdfhelper::langstring(
        x = data[i, paste0("NAME_", toupper(lang))],
        lang = lang
      )
    )
  }

  #' assign crop category by looking up value in LUT
  triple(
    subject = subject,
    predicate = uri("partOf", base),
    object =  subset(
      x = categories,
      subset = CULTIVATIONTYPECATEGORY_DE ==
        data[i, ][["CULTIVATIONTYPECATEGORY_DE"]],
      select = "uri"
    ) %>% unlist()
  )

}

sink()
