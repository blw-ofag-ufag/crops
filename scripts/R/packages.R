#' =============================================================================
#'       title:  R PACKAGE INSTALLATION SCRIPT
#' description:  This script checks for the existence of required packages
#'               before installing them. It handles packages from both CRAN and
#'               GitHub.
#' =============================================================================

#' Loop through the list of CRAN packages
for (package in c("remotes", "dplyr", "jsonlite", "xml2")) {
  if (!requireNamespace(package, quietly = TRUE)) {
    install.packages(package, repos = "https://cloud.r-project.org")
  }
}

#' Install the package from GitHub using the 'remotes' package
if (!requireNamespace("rdfhelper", quietly = TRUE)) {
  remotes::install_github("Damian-Oswald/rdfhelper")
}
