/**
 * Active Recall Study Assistant
 * Main Application Controller
 */

// API base URL
const API_BASE = '';

// Global state
const state = {
    currentView: 'notes',
    sections: [],
    currentSection: null,
    llmStatus: null
};

// ========================================
// Utility Functions
// ========================================

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Make API request
 */
async function api(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };

    if (options.body && typeof options.body === 'object') {
        config.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, config);

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(error.detail || 'Request failed');
    }

    return response.json();
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.25s ease reverse';
        setTimeout(() => toast.remove(), 250);
    }, 4000);
}

/**
 * Show loading overlay
 */
function showLoading(message = 'Loading...') {
    const overlay = document.getElementById('loading-overlay');
    const text = document.getElementById('loading-text');
    text.textContent = message;
    overlay.classList.remove('hidden');
}

/**
 * Hide loading overlay
 */
function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

/**
 * Switch between views
 */
function switchView(viewName) {
    // Update state
    state.currentView = viewName;

    // Update navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Update views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.toggle('active', view.id === `${viewName}-view`);
        view.classList.toggle('hidden', view.id !== `${viewName}-view`);
    });

    // Refresh section selects when switching to quiz or recall
    if (viewName === 'quiz' || viewName === 'recall') {
        populateSectionSelects();
    }
}

/**
 * Populate section select dropdowns
 */
function populateSectionSelects() {
    const quizSelect = document.getElementById('quiz-section-select');
    const recallSelect = document.getElementById('recall-section-select');

    const optionsHtml = `
        <option value="">Choose a section...</option>
        ${state.sections.map(s => `<option value="${s.id}">${s.title}</option>`).join('')}
    `;

    if (quizSelect) quizSelect.innerHTML = optionsHtml;
    if (recallSelect) recallSelect.innerHTML = optionsHtml;
}

/**
 * Check LLM status
 */
async function checkLLMStatus() {
    const statusIndicator = document.getElementById('llm-status');
    const statusDot = statusIndicator.querySelector('.status-dot');
    const statusText = statusIndicator.querySelector('.status-text');

    try {
        const health = await api('/api/health');
        state.llmStatus = health.ollama;

        if (health.ollama.ollama_running && health.ollama.model_available) {
            statusDot.className = 'status-dot online';
            statusText.textContent = 'LLM Ready';
        } else if (health.ollama.ollama_running) {
            statusDot.className = 'status-dot';
            statusText.textContent = 'Model loading...';
        } else {
            statusDot.className = 'status-dot offline';
            statusText.textContent = 'LLM Offline';
        }
    } catch (error) {
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'API Error';
    }
}

// ========================================
// Event Listeners Setup
// ========================================

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Import modal
    document.getElementById('import-btn').addEventListener('click', () => {
        document.getElementById('import-modal').classList.remove('hidden');
    });

    document.getElementById('import-modal-close').addEventListener('click', () => {
        document.getElementById('import-modal').classList.add('hidden');
    });

    document.getElementById('import-cancel-btn').addEventListener('click', () => {
        document.getElementById('import-modal').classList.add('hidden');
    });

    document.querySelector('.modal-overlay').addEventListener('click', () => {
        document.getElementById('import-modal').classList.add('hidden');
    });

    // File import
    document.getElementById('import-file').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById('import-textarea').value = event.target.result;
            };
            reader.readAsText(file);
        }
    });

    document.getElementById('import-confirm-btn').addEventListener('click', handleImport);

    // Export all
    document.getElementById('export-all-btn').addEventListener('click', handleExportAll);
}

/**
 * Handle import
 */
async function handleImport() {
    const textarea = document.getElementById('import-textarea');
    const content = textarea.value.trim();

    if (!content) {
        showToast('Please paste JSON content or select a file', 'error');
        return;
    }

    try {
        const data = JSON.parse(content);

        // Validate structure
        if (!data.sections && !data.section) {
            throw new Error('Invalid format: expected "sections" array or "section" object');
        }

        const sections = data.sections || [data.section];

        showLoading('Importing notes...');
        await api('/api/notes/import', {
            method: 'POST',
            body: { sections }
        });

        hideLoading();
        showToast(`Successfully imported ${sections.length} section(s)`, 'success');

        // Close modal and refresh
        document.getElementById('import-modal').classList.add('hidden');
        textarea.value = '';
        await loadSections();
    } catch (error) {
        hideLoading();
        showToast(`Import failed: ${error.message}`, 'error');
    }
}

/**
 * Handle export all
 */
async function handleExportAll() {
    try {
        const data = await api('/api/notes/export/all');
        downloadJSON(data, 'notes_export.json');
        showToast('Notes exported successfully', 'success');
    } catch (error) {
        showToast(`Export failed: ${error.message}`, 'error');
    }
}

/**
 * Download JSON file
 */
function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Load sections from API
 */
async function loadSections() {
    try {
        state.sections = await api('/api/notes/');
        renderSectionsList();
        populateSectionSelects();
    } catch (error) {
        console.error('Failed to load sections:', error);
        showToast('Failed to load sections', 'error');
    }
}

// ========================================
// App Initialization
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();

    // Check LLM status
    await checkLLMStatus();

    // Load sections
    await loadSections();

    // Periodically check LLM status
    setInterval(checkLLMStatus, 30000);
});
