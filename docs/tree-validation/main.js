const ENDPOINT = 'https://lindas.admin.ch/query';

mermaid.initialize({ 
    startOnLoad: false,
    maxEdges: 5000, 
    theme: 'base',
    themeVariables: {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: '14px',
        primaryColor: '#ffffff',
        primaryTextColor: '#111827',
        primaryBorderColor: '#111827',
        lineColor: '#9ca3af'
    },
    flowchart: { useMaxWidth: false, nodeSpacing: 40, rankSpacing: 60 }
});

// Utility to format long labels
function formatNodeLabel(text, limit = 25) {
    if (!text) return 'Unknown';
    text = text.replace(/"/g, ''); 
    if (text.length > 80) text = text.substring(0, 80).trim() + '...';
    
    const words = text.split(' ');
    let lines = [], currentLine = '';
    
    for (let word of words) {
        if ((currentLine + word).length > limit) {
            if (currentLine) lines.push(currentLine.trim());
            currentLine = word + ' ';
        } else {
            currentLine += word + ' ';
        }
    }
    if (currentLine) lines.push(currentLine.trim());
    return lines.join('<br/>');
}

function getSafeId(uri) {
    if (!uri) return 'unknown';
    const parts = uri.split('/');
    return 'node_' + (parts.pop() || '').replace(/[^a-zA-Z0-9]/g, '');
}

// Fetch tree data and system overlaps
// Fetch tree data and system overlaps
async function renderTree(rootIdsStr) {
    const appDiv = document.getElementById('graph-container');
    appDiv.innerHTML = '<div style="padding: 20px; color: #6b7280;">Lade Daten von LINDAS...</div>';

    // Parse IDs to SPARQL VALUES format: ct:22 ct:23
    const ids = rootIdsStr.split(',').map(id => id.trim()).filter(id => id);
    if(ids.length === 0) {
        appDiv.innerHTML = '<div class="error">Bitte eine gültige ID eingeben.</div>';
        return;
    }
    const valuesStr = ids.map(id => `ct:${id}`).join(' ');

    const treeQuery = `
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX schema: <http://schema.org/>
        PREFIX : <https://agriculture.ld.admin.ch/crops/>
        PREFIX ct: <https://agriculture.ld.admin.ch/crops/cultivationtype/>

        SELECT DISTINCT ?child ?childName ?parent ?parentName
        FROM <https://lindas.admin.ch/foag/crops>
        WHERE {
          VALUES ?root { ${valuesStr} }
          ?child rdfs:subClassOf* ?root .
          ?child rdfs:subClassOf ?parent .
          
          # Transitive Reduktion: Filtere alle indirekten Beziehungen (Shortcuts) heraus
          FILTER NOT EXISTS {
            ?child rdfs:subClassOf ?mid .
            ?mid rdfs:subClassOf ?parent .
            FILTER(?mid != ?child && ?mid != ?parent)
          }

          ?child schema:name|rdfs:label ?childName .
          ?parent schema:name|rdfs:label ?parentName .
          FILTER(LANG(?childName) = "de")
          FILTER(LANG(?parentName) = "de")
        }
    `;

    const systemsQuery = `
        PREFIX : <https://agriculture.ld.admin.ch/crops/>
        PREFIX cube: <https://cube.link/>
        SELECT DISTINCT ?CultivationType ?System
        FROM <https://lindas.admin.ch/foag/crops>
        WHERE {
          ?System cube:observationSet / cube:observation / (:cultivationType|:cultivationGroup|:cultivationCategory|:cultivationSubCategory) ?CultivationType .
        }
    `;

    try {
        const [treeRes, sysRes] = await Promise.all([
            fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/sparql-results+json' }, body: 'query=' + encodeURIComponent(treeQuery) }),
            fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/sparql-results+json' }, body: 'query=' + encodeURIComponent(systemsQuery) })
        ]);

        if (!treeRes.ok || !sysRes.ok) throw new Error("HTTP Fehler bei der SPARQL Abfrage.");

        const treeData = await treeRes.json();
        const sysData = await sysRes.json();

        // Map system tags
        const nodeSystems = {};
        sysData.results.bindings.forEach(row => {
            const uri = row.CultivationType.value;
            const match = row.System.value.match(/crops\/([^\/]+)\//);
            if (match) {
                if (!nodeSystems[uri]) nodeSystems[uri] = new Set();
                nodeSystems[uri].add(match[1]);
            }
        });

        const nodes = new Map();
        const edges = [];
        const edgeSet = new Set(); // Kanten-Deduplizierung

        treeData.results.bindings.forEach(row => {
            nodes.set(row.child.value, row.childName.value);
            nodes.set(row.parent.value, row.parentName.value);
            
            // Verhindere parallele Kanten durch Duplikate im SPARQL-Ergebnis
            const edgeKey = `${row.child.value}|${row.parent.value}`;
            if (!edgeSet.has(edgeKey)) {
                edgeSet.add(edgeKey);
                edges.push({ source: row.child.value, target: row.parent.value });
            }
        });

        if (nodes.size === 0) {
            appDiv.innerHTML = '<div style="padding: 20px;">Keine Resultate gefunden. Überprüfe die ID.</div>';
            return;
        }

        let mermaidSyntax = "flowchart BT\n";
        nodes.forEach((rawLabel, uri) => {
            const id = getSafeId(uri);
            let label = `<b>${formatNodeLabel(rawLabel)}</b>`;
            
            const sysList = nodeSystems[uri];
            if (sysList && sysList.size > 0) {
                const sysMap = { 'agis': 'DZ', 'naebi': 'SB', 'psm': 'PSM' };
                const tags = Array.from(sysList).sort().map(s => sysMap[s] || s).join(', ');
                label += `<br/><small>[${tags}]</small>`;
                mermaidSyntax += `    ${id}["${label}"]:::systemNode\n`;
            } else {
                mermaidSyntax += `    ${id}["${label}"]\n`;
            }
        });

        edges.forEach(e => {
            mermaidSyntax += `    ${getSafeId(e.source)} --> ${getSafeId(e.target)}\n`;
        });

        mermaidSyntax += `    classDef systemNode fill:#eff6ff,stroke:#3b82f6,stroke-width:2px,color:#1e40af;\n`;

        appDiv.innerHTML = `<div class="mermaid">${mermaidSyntax}</div>`;
        await mermaid.run({ querySelector: '.mermaid' });
        
        setupZoomAndPan('.zoom-container');
        document.getElementById('export-svg-btn').style.display = 'block';

    } catch (error) {
        appDiv.innerHTML = `<div class="error"><strong>Fehler:</strong> ${error.message}</div>`;
    }
}

// Setup simple pan and zoom
function setupZoomAndPan(containerSelector) {
    const container = document.querySelector(containerSelector);
    const svg = container.querySelector('svg');
    if (!svg) return;

    svg.style.maxWidth = 'none';
    svg.style.height = 'auto';

    let isDragging = false, startPan = { x: 0, y: 0 }, pan = { x: 0, y: 0 }, scale = 1;

    const wrapper = document.createElement('div');
    wrapper.style.transformOrigin = '0 0';
    wrapper.style.display = 'inline-block';
    
    svg.parentNode.insertBefore(wrapper, svg);
    wrapper.appendChild(svg);

    const updateTransform = () => wrapper.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${scale})`;

    container.addEventListener('wheel', e => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
        const svgX = (mouseX - pan.x) / scale, svgY = (mouseY - pan.y) / scale;

        scale *= (1 + delta * 0.1);
        scale = Math.min(Math.max(0.1, scale), 5);
        pan.x = mouseX - (svgX * scale);
        pan.y = mouseY - (svgY * scale);
        updateTransform();
    }, { passive: false });

    container.addEventListener('mousedown', e => {
        isDragging = true;
        startPan = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    });
    window.addEventListener('mousemove', e => {
        if (!isDragging) return;
        pan.x = e.clientX - startPan.x;
        pan.y = e.clientY - startPan.y;
        updateTransform();
    });
    window.addEventListener('mouseup', () => isDragging = false);
    
    // Auto-center on load
    setTimeout(() => {
        const svgRect = svg.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (svgRect.width > containerRect.width) scale = containerRect.width / (svgRect.width + 100);
        pan.x = (containerRect.width - (svgRect.width * scale)) / 2;
        updateTransform();
    }, 100);
}

// SVG Export
document.getElementById('export-svg-btn').addEventListener('click', () => {
    const svgElement = document.querySelector('.mermaid svg');
    if (!svgElement) return;
    const clone = svgElement.cloneNode(true);
    if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.style.backgroundColor = '#ffffff';
    
    const svgData = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kulturbaum_export.svg`;
    link.click();
    URL.revokeObjectURL(url);
});

// Initialization
const urlParams = new URLSearchParams(window.location.search);
const rootParam = urlParams.get('root') || '23'; // Default to Gemüsebau
document.getElementById('root-input').value = rootParam;

document.getElementById('load-btn').addEventListener('click', () => {
    const inputVal = document.getElementById('root-input').value;
    window.history.pushState({}, '', `?root=${inputVal}`);
    renderTree(inputVal);
});

renderTree(rootParam);