#' =============================================================================
#'       title:  MEASURING INTEROPERABILITY SCORES
#'      author:  Damian Oswald
#'        date:  2025-11-2025
#' description:  Script to generate mapping tables from the crops graph, compute
#'               certain interoperability scores for all kinds of database
#'               interactions and visualize these scores.
#' =============================================================================

#' Add libraries to search path
library(rdfhelper)
library(readr)
library(stringr)
library(tidyverse)
library(ggtext)
library(scales)

# Define the systems to compare
systems <- c("AGIS", "NAEBI", "SRPPP")

# Set the date to make the visualization

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

# Programmatically generate all unique permutations (excluding self-matches)
metrics_df <- expand.grid(
  Source = systems,
  Target = systems,
  stringsAsFactors = FALSE
) %>%
  filter(Source != Target) %>%
  as_tibble() %>%
  # Compute metrics for every pair row-wise
  mutate(data = map2(Source, Target, ~ compute_all_metrics(.x, .y))) %>%
  # Extract the matrix results into a tidy format
  mutate(tidy_data = map(data, ~ .x %>%
    as.data.frame() %>%
    rownames_to_column(var = "relation") %>%
    pivot_longer(
      cols = c("S", "T"),
      names_to = "direction",
      values_to = "score"
    )
  )) %>%
  select(Source, Target, tidy_data) %>%
  unnest(tidy_data)

# Process data for plotting
pd <- metrics_df %>%
  mutate(
    # Create a label for the facet headers (e.g., "AGIS → NAEBI")
    pair_label = paste0(Source, " \u2192 ", Target),

    # Recode relations to be human-readable
    relation = recode(relation,
      "exactMatch" = "Exact match",
      "broadMatch" = "Broad match",
      "narrowMatch" = "Narrow match",
      "disjoint" = "Disjoint"
    ),

    # Define Factor Order: Exact (Bottom) -> Broad -> Narrow -> Disjoint (Top)
    relation = factor(
      relation,
      levels = c(
        "Exact match",
        "Broad match",
        "Narrow match",
        "Disjoint"
      )
    ),

    # Create clean direction labels for x-axis
    dl = ifelse(direction == "S", "Source", "Target"),

    # Percentage labels (hide if < 3% to avoid clutter)
    pct_label = ifelse(score > 0.03, scales::percent(score, accuracy = 1), "")
  )

# Visualization
# Define a professional, corporate palette
status_colors <- c(
  "Exact match"  = "#0a525e",  # Dark Blue/Grey (Foundation/Bottom)
  "Broad match"  = "#136c7c",  # Teal (Bridge)
  "Narrow match" = "#b9c2c2",  # Mint (Specific)
  "Disjoint"     = "#d6dbdb"   # Light Grey (Top/Noise)
)

p <- ggplot(pd, aes(x = dl, y = score, fill = fct_rev(relation))) +
  # Thicker bars (width = 0.85) to bring them closer within the pair
  geom_col(position = "fill", width = 0.85, color = "white", linewidth = 0.25) +

  # Add labels inside bars
  geom_text(
    aes(label = pct_label),
    position = position_fill(vjust = 0.5),
    size = 3,
    fontface = "bold",
    color = ifelse(
      pd$relation %in% c("Disjoint", "Narrow match"),
      "gray20",
      "white"
    )
  ) +

  # Layout: Single row, seamless look
  facet_wrap(~ pair_label, nrow = 1) +

  # Scales and Colors
  scale_y_continuous(labels = scales::percent_format(), expand = c(0,0)) +
  scale_fill_manual(values = status_colors) +

  # Labels
  labs(
    title = "Quantifying interoperability",
    subtitle = "Comparison of the interoperability of crop concepts in different agricultural information systems", #nolint
    x = NULL,
    y = NULL,
    fill = "Match Type"
  ) +

  # Theme Customization
  theme_minimal(base_family = "sans") +
  theme(
    plot.title = element_markdown(
      face = "bold",
      size = 16, margin = margin(b = 5)
    ),
    plot.subtitle = element_text(
      color = "gray40",
      margin = margin(b = 20)
    ),
    strip.text = element_text(
      face = "bold",
      size = 11,
      margin = margin(b = 10)
    ),
    strip.background = element_blank(),
    panel.grid.major.x = element_blank(),
    panel.grid.minor = element_blank(),
    axis.text.y = element_text(color = "gray60", size = 9),
    axis.text.x = element_text(
      face = "bold", color = "gray30", margin = margin(t = 5)
    ),
    legend.position = "right",
    legend.title = element_text(face = "bold", size = 10)
  )

# Export
ggsave(
  filename = "resources/interoperability.png",
  plot = p,
  width = 12, height = 6, dpi = 300,
  bg = "white"
)
