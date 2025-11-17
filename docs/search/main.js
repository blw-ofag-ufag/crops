// Note: 'defer' in the <script> tag ensures this runs after the DOM is loaded.
// So, we don't need a DOMContentLoaded wrapper.

// SPARQL Endpoint
const sparqlEndpoint = 'https://agriculture.ld.admin.ch/query';

// 1. Updated SPARQL query to include ?classes
const sparqlQuery = `
PREFIX schema: <http://schema.org/>
PREFIX : <https://agriculture.ld.admin.ch/crops/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT
  ?crop
  ?name
  ?taxonName
  ?description
  (GROUP_CONCAT(DISTINCT ?parentName; SEPARATOR=", ") AS ?allParentNames)
  (GROUP_CONCAT(DISTINCT ?directParentName; SEPARATOR=", ") AS ?directParentNames)
  (GROUP_CONCAT(DISTINCT ?commonName; SEPARATOR=", ") AS ?commonNames)
  (GROUP_CONCAT(DISTINCT ?allChildName; SEPARATOR=", ") AS ?allChildNames)
  (GROUP_CONCAT(DISTINCT ?directChildName; SEPARATOR=", ") AS ?directChildNames)
  (GROUP_CONCAT(DISTINCT ?class; SEPARATOR=" ") AS ?classes) # NEW: Get all classes
WHERE {
  ?crop a :CultivationType .
  ?crop schema:name ?name .
  FILTER(LANG(?name) = "de")  
  
  ?crop a ?class .

  # Gets ALL parents (recursive)
  OPTIONAL {
    ?crop :partOf+ ?parent . 
    ?parent schema:name ?parentName .
    FILTER(LANG(?parentName) = "de")
  }
  
  # Gets ONLY DIRECT parents (non-recursive)
  OPTIONAL {
    ?crop :partOf ?directParent . # No '+'
    ?directParent schema:name ?directParentName .
    FILTER(LANG(?directParentName) = "de")
  }

  # Gets ALL children (recursive)
  OPTIONAL {
    ?crop :hasPart+ ?allChild . # With '+'
    ?allChild schema:name ?allChildName .
    FILTER(LANG(?allChildName) = "de")
  }
  
  # Gets ONLY DIRECT children (non-recursive)
  OPTIONAL {
    ?crop :hasPart ?directChild . # No '+'
    ?directChild schema:name ?directChildName .
    FILTER(LANG(?directChildName) = "de")
  }
  
  OPTIONAL {
    ?crop :botanicalPlant ?plant .
    ?plant :taxonName ?taxonName .
    ?plant (schema:name|schema:alternateName) ?commonName .
    FILTER(LANG(?commonName)="de")
  }
  OPTIONAL {
    ?crop schema:description ?description .
    FILTER(LANG(?description)="de")
  }
}
GROUP BY ?crop ?name ?taxonName ?description
ORDER BY ?name
`;

// --- Data Cache ---
let allCrops = [];
let dataLoaded = false;
let isFetching = false;
let searchHistory = [];
const historyKey = 'goograinHistory';

// --- NEW: State variables for tab filtering ---
let currentScoredResults = []; // Holds all results for the current term
let lastSearchTerm = '';      // The term used for the current results
let activeClassFilter = 'All';  // The IRI of the active tab, or 'All'

// --- DOM Elements ---
const searchView = document.getElementById('search-view');
const resultsView = document.getElementById('results-view');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchBarWrapper = document.getElementById('search-bar-wrapper');
const suggestionsDropdown = document.getElementById('suggestions-dropdown');
const resultsForm = document.getElementById('results-search-form');
const resultsInput = document.getElementById('results-search-input');
const resultsContainer = document.getElementById('results-container');
const logoSmallButton = document.getElementById('logo-small-button');
const tabsContainer = document.getElementById('tabs-inner-container'); // NEW

// --- Suggestion Icons (SVG) ---
const historyIcon = `<svg class="icon" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 0 1 7-7 7 7 0 0 1 7 7 7 7 0 0 1-7 7v2a9 9 0 0 0 9-9z"></path><path d="M12 8v5l4.5 2.5.8-1.2L12.5 13V8z"></path></svg>`;
const searchIcon = `<svg class="icon" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path></svg>`;

let activeSuggestionIndex = -1;

// --- Functions ---

// 2. Updated fetchCropData
async function fetchCropData() {
    if (dataLoaded) return allCrops;
    if (isFetching) return;
    
    isFetching = true;
    console.log("Fetching crop data...");

    try {
        const response = await fetch(sparqlEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/sparql-results+json'
            },
            body: 'query=' + encodeURIComponent(sparqlQuery)
        });

        if (!response.ok) throw new Error(`SPARQL query failed: ${response.status}`);

        const data = await response.json();
        
        allCrops = data.results.bindings.map(item => ({
            crop: item.crop?.value || '',
            name: item.name?.value || '',
            taxonName: item.taxonName?.value || '',
            parentNames: item.allParentNames?.value || '',
            directParentNames: item.directParentNames?.value || '',
            commonNames: item.commonNames?.value || '',
            description: item.description?.value || '',
            childNames: item.allChildNames?.value || '',
            directChildNames: item.directChildNames?.value || '',
            classes: item.classes?.value || '' // NEW: Read the classes string
        })).filter(crop => crop.name);

        dataLoaded = true;
        console.log(`Successfully fetched ${allCrops.length} crops.`);
        return allCrops;

    } catch (error) {
        console.error('Error fetching data:', error);
        resultsContainer.innerHTML = `<p class="error-text">Failed to load crop data.</p>`;
        return [];
    } finally {
        isFetching = false;
    }
}

/**
 * 3. Updated Search Logic (Scoring)
 * This function ONLY scores. Filtering by class happens in renderResults.
 */
function performSearch(term) {
    const lowerTerm = term.toLowerCase().trim();
    if (!lowerTerm) return [];

    const searchWords = lowerTerm.split(/\s+/).filter(Boolean);

    const scoredResults = allCrops.map(crop => {
        let score = 0;
        const lowerName = crop.name.toLowerCase();
        const lowerCommon = crop.commonNames.toLowerCase();
        const lowerTaxon = crop.taxonName.toLowerCase();
        const lowerAllParents = crop.parentNames.toLowerCase();
        const lowerDirectParents = crop.directParentNames.toLowerCase();
        const lowerAllChild = crop.childNames.toLowerCase();
        const lowerDirectChild = crop.directChildNames.toLowerCase();
        const lowerDescription = crop.description.toLowerCase();

        if (lowerName === lowerTerm) score += 1000;

        for (const word of searchWords) {
            if (lowerName.includes(word)) {
                score += 40;
                if (lowerName.startsWith(word)) score += 20;
            }
            if (lowerCommon.includes(word)) score += 30;
            if (lowerDirectParents.includes(word)) score += 25;
            if (lowerTaxon.includes(word)) score += 20;
            if (lowerDirectChild.includes(word)) score += 15;
            if (lowerAllParents.includes(word) && !lowerDirectParents.includes(word)) score += 5;
            if (lowerAllChild.includes(word) && !lowerDirectChild.includes(word)) score += 5;
            if (lowerDescription.includes(word)) score += 2;
        }

        return { ...crop, score };
    });

    return scoredResults.filter(item => item.score > 0).sort((a, b) => b.score - a.score);
}


/**
 * 4. Updated Render Logic
 * Now filters the full result set based on `activeClassFilter` before rendering.
 */
function renderResults(allScoredResults, term) {
    
    // Step 1: Filter the results based on the active tab
    const filteredResults = allScoredResults.filter(item => {
        if (activeClassFilter === 'All') {
            return true; // No filter
        }
        // Check if the space-separated 'classes' string includes the active filter IRI
        return item.classes.includes(activeClassFilter);
    });

    // Step 2: Render the filtered list
    if (filteredResults.length === 0) {
        if (activeClassFilter === 'All') {
            resultsContainer.innerHTML = `<p>Für "<strong>${term}</strong> wurden leider keine Resultate gefunden.".</p>`;
        } else {
            resultsContainer.innerHTML = `<p>Für "<strong>${term}</strong>" wurden in dieser Kategorie leider keine Resultate gefunden.</p>`;
        }
        return;
    }
    
    resultsContainer.innerHTML = filteredResults.map(item => {
        const hasDescription = item.description && item.description.trim() !== '';

        return `
            <div class="result-item">
                <span class="url">${item.crop}</span>
                <h3>
                    <a href="${item.crop}" target="_blank">
                        ${item.name}
                    </a>
                </h3>
                ${hasDescription ? `<p class="snippet">${item.description}</p>` : ''}
            </div>
        `;
    }).join('');
}

/**
 * 5. Updated showResultsPage
 * - Resets tabs to 'All' on a new search.
 * - Stores the full list of results and the search term.
 */
async function showResultsPage(term) {
    searchView.style.display = 'none';
    resultsView.style.display = 'block';
    resultsInput.value = term;
    resultsContainer.innerHTML = `<p class="loading-text">Searching...</p>`;
    
    // Reset to 'All' tab for every new search
    activeClassFilter = 'All';
    document.querySelectorAll('.results-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.filter === 'All');
    });

    await fetchCropData();
    
    // Store full results and term
    lastSearchTerm = term;
    currentScoredResults = performSearch(term);
    
    // Render (which will use the 'All' filter by default)
    renderResults(currentScoredResults, term);
}

function showSearchPage() {
    resultsView.style.display = 'none';
    searchView.style.display = 'flex';
    searchInput.focus();
}

function loadSearchHistory() {
    searchHistory = JSON.parse(localStorage.getItem(historyKey)) || [];
}

function saveSearchHistory(term) {
    const cleanedTerm = term.toLowerCase().trim();
    if (!cleanedTerm) return;
    searchHistory = searchHistory.filter(t => t !== cleanedTerm);
    searchHistory.unshift(cleanedTerm);
    searchHistory = searchHistory.slice(0, 10);
    localStorage.setItem(historyKey, JSON.stringify(searchHistory));
}

function handleSearchSubmit(term) {
    const cleanedTerm = term.trim();
    if (!cleanedTerm) return;
    saveSearchHistory(cleanedTerm);
    closeSuggestions();
    showResultsPage(cleanedTerm); // Use the cleaned term
}

function renderSuggestions() {
    const term = searchInput.value.toLowerCase().trim();
    suggestionsDropdown.innerHTML = '';
    
    if (term === '' || !dataLoaded) {
        closeSuggestions();
        return;
    }

    const historyMatches = searchHistory
        .filter(t => t.startsWith(term))
        .map(t => ({ type: 'history', text: t }));

    const suggestions = allCrops
        .filter(crop => crop.name.toLowerCase().startsWith(term))
        .map(crop => ({ type: 'suggestion', text: crop.name }));

    const combined = [...historyMatches, ...suggestions];
    const unique = Array.from(new Map(combined.map(item => [item.text, item])).values());
    const finalSuggestions = unique.slice(0, 10);

    if (finalSuggestions.length === 0) {
        closeSuggestions();
        return;
    }

    finalSuggestions.forEach((item, index) => {
        const el = document.createElement('div');
        el.classList.add('suggestion-item');
        el.dataset.index = index;
        el.dataset.text = item.text;

        el.innerHTML = `
            ${item.type === 'history' ? historyIcon : searchIcon}
            <span>${item.text.substring(0, term.length)}<strong>${item.text.substring(term.length)}</strong></span>
        `;
        
        suggestionsDropdown.appendChild(el);
    });

    suggestionsDropdown.style.display = 'block';
    searchBarWrapper.classList.add('dropdown-open');
    activeSuggestionIndex = -1;
}

function closeSuggestions() {
    suggestionsDropdown.style.display = 'none';
    searchBarWrapper.classList.remove('dropdown-open');
    activeSuggestionIndex = -1;
}

function handleKeydown(e) {
    const items = document.querySelectorAll('.suggestion-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeSuggestionIndex > -1) {
            const selectedText = items[activeSuggestionIndex].dataset.text;
            searchInput.value = selectedText;
            handleSearchSubmit(selectedText);
        } else {
            handleSearchSubmit(searchInput.value);
        }
        return;
    } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSuggestions();
        return;
    }

    items.forEach((item, index) => {
        item.classList.toggle('active', index === activeSuggestionIndex);
    });
    
    if (activeSuggestionIndex > -1) {
        searchInput.value = items[activeSuggestionIndex].dataset.text;
    }
}

// --- Event Listeners ---

searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSearchSubmit(searchInput.value);
});

resultsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSearchSubmit(resultsInput.value);
});

logoSmallButton.addEventListener('click', () => {
    showSearchPage();
});

searchInput.addEventListener('input', renderSuggestions);
searchInput.addEventListener('focus', renderSuggestions);
searchInput.addEventListener('keydown', handleKeydown);

suggestionsDropdown.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.suggestion-item');
    if (item) {
        const text = item.dataset.text;
        searchInput.value = text;
        handleSearchSubmit(text);
    }
});

document.addEventListener('click', (e) => {
    if (!searchForm.contains(e.target)) {
        closeSuggestions();
    }
});

// 6. NEW: Event Listener for Tab Clicks
tabsContainer.addEventListener('click', (e) => {
    const clickedTab = e.target.closest('.results-tab');
    if (!clickedTab) return;

    const newFilter = clickedTab.dataset.filter;
    if (newFilter === activeClassFilter) return; // Already active

    // Update state
    activeClassFilter = newFilter;

    // Update UI (active class)
    tabsContainer.querySelectorAll('.results-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.filter === newFilter);
    });

    // Re-render the results with the new filter, using stored data
    renderResults(currentScoredResults, lastSearchTerm);
});


// --- Initial Load ---
loadSearchHistory();
fetchCropData(); // Pre-fetch data
searchInput.focus();