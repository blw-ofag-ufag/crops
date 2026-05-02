mermaid.initialize({ 
    startOnLoad: false, 
    theme: 'default',
    state: { useMaxWidth: false }
});

async function fetchAndRenderData() {
    const endpointUrl = 'https://lindas.admin.ch/query';
    const appDiv = document.getElementById('app');

    try {
        // Fetch the SPARQL query from the local file
        const queryRes = await fetch('query.rq');
        if (!queryRes.ok) throw new Error('Fehler beim Laden von query.rq. Läuft ein lokaler Webserver?');
        const sparqlQuery = await queryRes.text();

        // Execute query against LINDAS
        const response = await fetch(endpointUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/sparql-results+json'
            },
            body: 'query=' + encodeURIComponent(sparqlQuery)
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        await renderInterface(data.results.bindings, appDiv);

    } catch (error) {
        appDiv.innerHTML = `<div class="error"><strong>Fehler:</strong> ${error.message}</div>`;
    }
}

function getSafeId(uri) {
    if (!uri) return 'unknown';
    return 'node_' + uri.split('/').pop().replace(/[^a-zA-Z0-9]/g, '');
}

function formatNodeLabel(text) {
    if (!text) return 'Unknown';
    text = text.replace(/"/g, ''); 
    
    const MAX_TOTAL_LENGTH = 80;
    const MAX_LINE_LENGTH = 30;
    
    if (text.length > MAX_TOTAL_LENGTH) {
        text = text.substring(0, MAX_TOTAL_LENGTH).trim() + '...';
    }
    
    const words = text.split(' ');
    let lines = [];
    let currentLine = '';
    
    for (let word of words) {
        if ((currentLine + word).length > MAX_LINE_LENGTH) {
            if (currentLine) {
                lines.push(currentLine.trim());
            }
            currentLine = word + ' ';
        } else {
            currentLine += word + ' ';
        }
    }
    if (currentLine) {
        lines.push(currentLine.trim());
    }
    
    return lines.join('\n');
}

async function renderInterface(bindings, container) {
    const observations = {};
    const nodeNames = {};

    bindings.forEach(row => {
        const ident = row.Identifier.value;
        
        if (!observations[ident]) {
            let validFromVal = row.ValidFrom ? row.ValidFrom.value : null;
            if (validFromVal === "https://cube.link/Undefined") validFromVal = null;

            let validToVal = row.ValidTo ? row.ValidTo.value : null;
            if (validToVal === "https://cube.link/Undefined") validToVal = null;

            observations[ident] = {
                crop: row.Crop.value,
                baseUri: row.CultivationType ? row.CultivationType.value : null,
                baseName: row.BaseName ? row.BaseName.value : null,
                description: row.BaseDesc ? row.BaseDesc.value : null,
                validFrom: validFromVal,
                validTo: validToVal,
                altNames: new Set(),
                edges: new Set() 
            };
        }

        const obs = observations[ident];

        if (row.BaseAltName) obs.altNames.add(row.BaseAltName.value);
        
        if (row.Step && row.NextStep) {
            const stepUri = row.Step.value;
            const nextUri = row.NextStep.value;
            
            nodeNames[stepUri] = row.StepName ? row.StepName.value : stepUri;
            nodeNames[nextUri] = row.NextStepName ? row.NextStepName.value : nextUri;
            
            obs.edges.add(`${stepUri}|${nextUri}`);
        }
    });

    container.innerHTML = '';

    if (Object.keys(observations).length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted);">Keine Resultate zurückgegeben.</div>';
        return;
    }

    const sortedEntries = Object.entries(observations).sort((a, b) => {
        const aUri = a[1].baseUri || "";
        const bUri = b[1].baseUri || "";
        const aSlugStr = aUri.split('/').pop();
        const bSlugStr = bUri.split('/').pop();
        
        const aInt = parseInt(aSlugStr, 10);
        const bInt = parseInt(bSlugStr, 10);

        const aIsNum = !isNaN(aInt);
        const bIsNum = !isNaN(bInt);

        if (aIsNum && bIsNum) return aInt - bInt;
        if (aIsNum) return -1;
        if (bIsNum) return 1;
        return aSlugStr.localeCompare(bSlugStr);
    });

    for (const [ident, obs] of sortedEntries) {
        const card = document.createElement('div');
        card.className = 'card';

        const textPanel = document.createElement('div');
        textPanel.className = 'text-panel';

        const mainName = obs.baseName || obs.crop; 
        const hasDifferentNames = obs.baseName && obs.baseName !== obs.crop;
        
        let displayIri = obs.baseUri;
        if (obs.baseUri) {
            const segments = obs.baseUri.split('/').filter(Boolean);
            if (segments.length >= 2) {
                displayIri = `${segments[segments.length - 2]}:${segments[segments.length - 1]}`;
            }
        }

        let textHTML = `<div class="main-title-row">`;
        if (obs.baseUri) {
            textHTML += `<a href="${obs.baseUri}" target="_blank" class="crop-iri" title="${obs.baseUri}">${displayIri}</a>`;
        }
        textHTML += `<h2 class="crop-name">${mainName}</h2>`;
        textHTML += `</div>`;

        if (obs.altNames.size > 0) {
            const altString = Array.from(obs.altNames).join(', ');
            textHTML += `<div class="alt-names">${altString}</div>`;
        }

        if (obs.description) {
            textHTML += `<div class="description">${obs.description}</div>`;
        }

        let attrsHTML = `<div class="attributes">`;
        attrsHTML += `<div class="attr-header">Attribute der Kultur im Quellsystem</div>`;
        
        let hasAttributes = false;
        
        if (ident) {
            hasAttributes = true;
            attrsHTML += `
                <div class="attr-row">
                    <div class="attr-key">Identifikator</div>
                    <div class="attr-val">${ident}</div>
                </div>`;
        }
        if (hasDifferentNames) {
            hasAttributes = true;
            attrsHTML += `
                <div class="attr-row">
                    <div class="attr-key">Originalname</div>
                    <div class="attr-val">${obs.crop}</div>
                </div>`;
        }
        if (obs.validFrom) {
            hasAttributes = true;
            attrsHTML += `
                <div class="attr-row">
                    <div class="attr-key">Gültig von</div>
                    <div class="attr-val">${obs.validFrom}</div>
                </div>`;
        }
        if (obs.validTo) {
            hasAttributes = true;
            attrsHTML += `
                <div class="attr-row">
                    <div class="attr-key">Gültig bis</div>
                    <div class="attr-val">${obs.validTo}</div>
                </div>`;
        }
        
        attrsHTML += `</div>`;
        
        if (hasAttributes) {
            textHTML += attrsHTML;
        }
        
        textPanel.innerHTML = textHTML;
        card.appendChild(textPanel);

        const graphPanel = document.createElement('div');
        graphPanel.className = 'graph-panel';
        
        if (obs.edges.size > 0) {
            let mermaidSyntax = "stateDiagram-v2\n    direction TB\n";
            
            const involvedUris = new Set();
            const edgeSources = new Set();
            const edgeTargets = new Set();

            obs.edges.forEach(edge => {
                const [source, target] = edge.split('|');
                involvedUris.add(source);
                involvedUris.add(target);
                edgeSources.add(source);
                edgeTargets.add(target);
            });

            const startNodes = new Set([...involvedUris].filter(uri => !edgeTargets.has(uri)));
            const endNodes = new Set([...involvedUris].filter(uri => !edgeSources.has(uri)));

            involvedUris.forEach(uri => {
                if (!startNodes.has(uri) && !endNodes.has(uri)) {
                    const id = getSafeId(uri);
                    const label = formatNodeLabel(nodeNames[uri]);
                    mermaidSyntax += `    state "${label}" as ${id}\n`;
                }
            });

            obs.edges.forEach(edge => {
                const [source, target] = edge.split('|');
                
                const sourceStr = startNodes.has(source) ? '[*]' : getSafeId(source);
                const targetStr = endNodes.has(target) ? '[*]' : getSafeId(target);
                
                mermaidSyntax += `    ${sourceStr} --> ${targetStr}\n`;
            });

            const mermaidDiv = document.createElement('div');
            mermaidDiv.className = 'mermaid';
            mermaidDiv.textContent = mermaidSyntax;
            graphPanel.appendChild(mermaidDiv);
        } else {
            graphPanel.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">Kein Pfad im Graph gefunden.</span>';
        }

        card.appendChild(graphPanel);
        container.appendChild(card);
    }

    try {
        await mermaid.run({ querySelector: '.mermaid' });
    } catch (err) {
        console.error("Mermaid rendering failed:", err);
    }
}

fetchAndRenderData();