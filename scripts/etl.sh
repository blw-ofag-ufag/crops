# Install any missing R packages
Rscript scripts/R/packages.R

# Run R processing steps
for r in agis grud srppp; do
  Rscript scripts/R/${r}.R
done
