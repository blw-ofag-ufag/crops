library(rdfhelper)
library(readr)
library(stringr)
library(tidyverse)

# Function to compute interoperability scores based on fetched data
compute_metrics <- function(data, x) {
  df <- data[, c(x, "relation")] %>%
    filter(!dplyr::if_all(tidyselect::everything(), is.na)) %>%
    unique()
  df[is.na(df$relation), 2] <- "disjoint"
  r <- with(df, table(relation))
  r <- r / sum(r)
  names(r) <- sub(".*#", "", names(r))
  r
}

# Function to fetch data and compute interoperability scores
compute_all_metrics <- function(source, target, date = NULL) {

  # construct query
  query <- str_replace_all(
    read_file("queries/mapping-table-generation.rq"),
    c(
      "__SOURCE__" = source,
      "__TARGET__"  = target,
      "__DATE__" = ifelse(
        is.null(date),
        as.character(Sys.Date()),
        date
      )
    )
  )

  # fetch data from LINDAS
  data <- sparql(query, "https://lindas.admin.ch/query")

  # Return df with computed metrics
  cbind(S = compute_metrics(data, "S"), T = compute_metrics(data, "T"))
}

compute_all_metrics("AGIS", "NAEBI")
compute_all_metrics("NAEBI", "AGIS")
compute_all_metrics("SRPPP", "AGIS")
