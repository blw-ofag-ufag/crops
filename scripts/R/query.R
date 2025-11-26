library(rdfhelper)
library(readr)
library(stringr)

# set variables
source <- "AGIS"
target <- "NAEBI"

# construct query
query <- str_replace_all(
  read_file("queries/mapping-table-generation.rq"),
  c("__SOURCE__" = "AGIS", "__TARGET__"  = "NAEBI")
)

# fetch data from LINDAS
data <- sparql(query, "https://lindas.admin.ch/query")

f <- function(x, y) {
  df <- rdfhelper::sparql(
    query = str_replace_all(
      read_file("queries/all-agis-codes-under-crop.rq"),
      c("__SYSTEM__" = x)
    ),
    "https://lindas.admin.ch/query"
  )

  cat(sprintf("Crops missing from the %s column:\n", x))
  a <- df$crop
  b <- unname(unlist(na.omit(data[, y])))
  a[!a %in% b]
  print(a[!a %in% b])
}

f(source, 1)
f(target, 3)
y <- 5
data[, y]
