# Cultivation Graphs Explorer

Dieses Projekt visualisiert landwirtschaftliche Hierarchien des BLW als interaktive Mermaid.js-Graphen.

## Features
- Dynamischer Fetch von LINDAS via SPARQL
- GitHub Bug Report Integration (`?template=bug.yml` Support)
- Automatische Source Code Line-Referenzierung (`raw.githubusercontent.com`)

## Setup
Um CORS-Fehler beim Laden der `query.rq` zu vermeiden, muss das Projekt über einen lokalen Webserver ausgeführt werden. 

Starten Sie dazu einfach in diesem Verzeichnis:
```bash
python -m http.server