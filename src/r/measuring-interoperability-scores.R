#' =============================================================================
#'       title:  MEASURING INTEROPERABILITY SCORES
#'      author:  Damian Oswald
#'        date:  2025-11-2025
#' description:  Script to generate mapping tables from the crops graph, compute
#'               certain interoperability scores for all kinds of database
#'               interactions and visualize these scores.
#' =============================================================================

#' =============================================================================
#' 1. PREPARATIONS
#' =============================================================================

#' Define global variables for analysis
DATE <- Sys.Date()
ROOT <- 14 # use the IRI slug for a reasonable group, e.g. 14 for cereals

#' Add libraries to search path
library(rdfhelper)
library(readr)
library(stringr)
library(tidyverse)
library(ggtext)
library(scales)
library(dplyr)
library(tidyr)

#' Fetch data from LINDAS
#' ======================
#'
#' Constructs and executes a SPARQL query to retrieve mapping data between a
#' source and target system from the LINDAS endpoint.
#'
#' @param source  A string identifying the source system.
#' @param target  A string identifying the target system.
#' @param date    An optional date string (YYYY-MM-DD).
#' @param root    The root node IRI slug; 0 (= all crops) by default.
#'
fetch_data <- function(source, target, date = NULL, root = NULL) {

  #' Construct the query from a .rq file
  query <- str_replace_all(
    read_file("queries/mapping-table-generation.rq"),
    c(
      "__SOURCE__" = source,
      "__TARGET__"  = target,
      "__DATE__" = ifelse(
        is.null(date),
        as.character(Sys.Date()),
        as.character(date)
      ),
      "__ROOT__" = ifelse(is.null(root), 0, root)
    )
  )

  #' Fetch data from LINDAS (or any other triple store...)
  sparql(query, "https://lindas.admin.ch/query")
}

#' Count the occurences of best relations
#' ======================================
#'
#' This function processes a dataset of entity relations, cleans SKOS URIs, and
#' calculates the frequency of specific mapping types.
#'
#' If a unique row possesses multiple relations, the function prioritizes them
#' according to a specific hierarchy (`exactMatch` > `broadMatch` >
#' `narrowMatch` > `disjoint`) and only counts the "best" match.
#'
#' @param data A data frame or tibble containing the raw mapping data.
#' @param column_name A character string specifying the column containing the
#'   entity identifiers (e.g., source IRIs).
#'
#' @return A named `table` object containing counts for "exactMatch",
#'   "broadMatch", "narrowMatch", and "disjoint". Categories with no matches
#'   will return a count of 0.
count_relations <- function(data, column_name) {

  # Define the hierarchy of matches (Best to Worst)
  relations <- c("exactMatch", "broadMatch", "narrowMatch", "disjoint")

  # process input data
  data %>%

    # select and rename columns
    select(x = all_of(column_name), relation) %>%

    # remove rows where all columns are NA
    filter(!if_all(everything(), is.na)) %>%

    # keep unique rows
    distinct() %>%

    # Clean the relation strings
    mutate(
      relation = replace_na(relation, "disjoint"),
      relation = gsub("http://www.w3.org/2004/02/skos/core#", "", relation),

      # Convert to an ordered factor.
      # Since 'exactMatch' is index 1, min() will select it over others.
      relation = factor(relation, levels = relations, ordered = TRUE)
    ) %>%

    # Group by the ID and take only the "best" relation found for that ID
    group_by(x) %>%
    summarise(relation = min(relation), .groups = "drop") %>%

    # extract the relation column and compute an occurence table
    # (this procedure is counting 0s automatically via factor levels)
    pull(relation) %>%
    table()
}

#' Function to fetch data and compute interoperability scores
#' ==========================================================
#'
#' @param source  A string identifying the source system.
#' @param target  A string identifying the target system.
#' @param date    An optional date string (YYYY-MM-DD).
#' @param root    The root node IRI slug; 0 (= all crops) by default.
#'
#' @return A data frame with columns `S` and `T` and rows for relations
compute_all_scores <- function(source, target, date = NULL, root = NULL) {
  cbind(
    S = count_relations(fetch_data(source, target, date, root), "S"),
    T = count_relations(fetch_data(source, target, date, root), "T")
  )
}


# ==============================================================================
# 2. SETUP & DATA GENERATION
# ==============================================================================

# Define the focus
systems <- c("AGIS", "NAEBI", "SRPPP")
focal_system <- "AGIS"

# Generate specific permutations: Only pairs involving AGIS
plot_data <- expand.grid(
  Source = systems,
  Target = systems,
  Date = DATE,
  Root = ROOT,
  stringsAsFactors = FALSE
) %>%
  as_tibble() %>%

  # Remove self-matches
  filter(Source != Target) %>%

  # Keep only pairs where AGIS is either source or target
  filter(Source == focal_system | Target == focal_system) %>%

  # Map compute_all_scores to arguments
  # Use pmap for >2 arguments
  # Note: The order of columns in the list() must match the order of arguments
  # in your compute_all_scores function definition.
  mutate(raw_matrix = pmap(
    list(Source, Target, Date, Root),
    compute_all_scores
  )) %>%

  # Tidy the matrix data into a long format
  mutate(tidy = map(raw_matrix, ~ .x %>%
    as.data.frame() %>%
    rownames_to_column("match_type") %>%
    pivot_longer(
      cols = c("S", "T"), 
      names_to = "sys_role", 
      values_to = "count"
    )
  )) %>%
  select(-raw_matrix) %>%
  unnest(tidy)

# ==============================================================================
# 3. DATA PROCESSING
# ==============================================================================

pd <- plot_data %>%
  # Calculate totals and percentages per bar
  group_by(Source, Target, sys_role) %>%
  mutate(
    total = sum(count),
    pct = count / total,

    # Create Label: "XX% (Count)" on one line
    # We hide labels for very small segments (< 3%) to avoid clutter
    label_text = ifelse(
      pct > 0.03,
      # Changed "\n" to " " to put them side-by-side
      paste0(scales::percent(pct, accuracy = 1), " (", count, ")"),
      ""
    ),

    # Determine the actual system name for the X-axis label
    system_name = ifelse(sys_role == "S", Source, Target)
  ) %>%
  ungroup() %>%

  # Formatting factors for visualization
  mutate(
    # Facet Header: "AGIS -> NAEBI"
    pair_label = paste(Source, "\u2192", Target),

    # Clean up match names
    match_type = recode(match_type,
      "exactMatch"  = "Exact match",
      "broadMatch"  = "Broad match",
      "narrowMatch" = "Narrow match",
      "disjoint"    = "Disjoint"
    ),

    # Set Order: Exact (Bottom) -> Broad -> Narrow -> Disjoint (Top)
    match_type = factor(
      match_type, 
      levels = c("Exact match", "Broad match", "Narrow match", "Disjoint")
    )
  )

# ==============================================================================
# 4. VISUALIZATION
# ==============================================================================

# Blue/Grey Palette matching your reference image
match_colors <- c(
  "Exact match"  = "#1a4a9c",
  "Broad match"  = "#4b7ecf",
  "Narrow match" = "#bfbfbf",
  "Disjoint"     = "#e8e8e8"
)

p <- ggplot(pd, aes(x = system_name, y = pct, fill = fct_rev(match_type))) +

  # Stacked Bar Chart
  geom_col(position = "fill", width = 0.85, color = "white", linewidth = 0.2) +

  # Add Text Labels (Percent + Count)
  geom_text(
    aes(label = label_text),
    position = position_fill(vjust = 0.5),
    size = 3,
    fontface = "bold",
    color = ifelse(
      pd$match_type %in% c("Disjoint", "Narrow match"),
      "gray20",
      "white"
    )
  ) +
  facet_wrap(~ pair_label, nrow = 1, scales = "free_x") +
  scale_y_continuous(labels = scales::percent_format(), expand = c(0, 0)) +
  scale_fill_manual(values = match_colors) +
  labs(
    title = "Interoperability Analysis for AGIS",
    subtitle = "Mapping coverage by relation type between AGIS and other systems", # nolint
    x = NULL,
    y = NULL,
    fill = "Match Type"
  ) +
  theme_minimal(base_family = "sans") +
  theme(
    plot.title = element_text(face = "bold", size = 16),
    plot.subtitle = element_text(color = "gray40", margin = margin(b = 20)),
    strip.text = element_text(face = "bold", size = 11, margin = margin(b = 10)),
    axis.text.x = element_text(face = "bold", color = "black", size = 10, margin = margin(t = 5)),
    panel.grid = element_blank(),
    legend.position = "right"
  )

# Export
ggsave("results/agis-interoperability.png", p, width = 12, height = 6, bg = "white")
