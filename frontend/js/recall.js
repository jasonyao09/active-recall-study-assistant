/**
 * Recall Module
 * Handles blind recall practice and LLM analysis
 */

// Recall state
const recallState = {
    sectionId: null,
    sectionTitle: '',
    analysisResult: null
};

// ========================================
// Recall Flow
// ========================================

function startRecall() {
    const sectionId = document.getElementById('recall-section-select').value;

    if (!sectionId) {
        showToast('Please select a section', 'error');
        return;
    }

    // Check LLM status
    if (!state.llmStatus?.ollama_running || !state.llmStatus?.model_available) {
        showToast('LLM is not ready. Please wait and try again.', 'error');
        return;
    }

    const section = state.sections.find(s => s.id === parseInt(sectionId));
    if (!section) return;

    recallState.sectionId = parseInt(sectionId);
    recallState.sectionTitle = section.title;

    // Update UI
    document.getElementById('recall-section-title').textContent = section.title;
    document.getElementById('recall-textarea').value = '';

    // Switch views
    document.getElementById('recall-setup').classList.add('hidden');
    document.getElementById('recall-active').classList.remove('hidden');
    document.getElementById('recall-results').classList.add('hidden');

    // Focus textarea
    document.getElementById('recall-textarea').focus();
}

function cancelRecall() {
    recallState.sectionId = null;
    recallState.sectionTitle = '';

    document.getElementById('recall-setup').classList.remove('hidden');
    document.getElementById('recall-active').classList.add('hidden');
}

async function submitRecall() {
    const userRecall = document.getElementById('recall-textarea').value.trim();

    if (!userRecall) {
        showToast('Please write what you remember before submitting', 'error');
        return;
    }

    try {
        showLoading('Analyzing your recall... This may take a moment.');

        const result = await api('/api/recall/analyze', {
            method: 'POST',
            body: {
                section_id: recallState.sectionId,
                user_recall: userRecall
            }
        });

        hideLoading();

        recallState.analysisResult = result;
        showAnalysisResults(result.analysis);
        showToast('Analysis complete', 'success');
    } catch (error) {
        hideLoading();
        showToast(`Analysis failed: ${error.message}`, 'error');
    }
}

// ========================================
// Results Display
// ========================================

function showAnalysisResults(analysis) {
    // Switch to results view
    document.getElementById('recall-active').classList.add('hidden');
    document.getElementById('recall-results').classList.remove('hidden');

    // Update score
    const score = analysis.score || 0;
    document.getElementById('recall-score').innerHTML = `
        <span class="score-circle">
            <span class="score-number">${score}</span>
            <span class="score-percent">%</span>
        </span>
        <span class="score-label">Recall Score</span>
    `;

    // Correct points
    const correctSection = document.getElementById('correct-section');
    const correctPoints = document.getElementById('correct-points');
    if (analysis.correct_points && analysis.correct_points.length > 0) {
        correctSection.classList.remove('hidden');
        correctPoints.innerHTML = analysis.correct_points
            .map(point => `<li>${escapeHtml(point)}</li>`)
            .join('');
    } else {
        correctSection.classList.add('hidden');
    }

    // Missed points
    const missedSection = document.getElementById('missed-section');
    const missedPoints = document.getElementById('missed-points');
    if (analysis.missed_points && analysis.missed_points.length > 0) {
        missedSection.classList.remove('hidden');
        missedPoints.innerHTML = analysis.missed_points
            .map(item => `
                <div class="missed-item">
                    <div class="missed-topic">${escapeHtml(item.topic || 'Missing Information')}</div>
                    <div class="missed-explanation">${escapeHtml(item.explanation || '')}</div>
                </div>
            `)
            .join('');
    } else {
        missedSection.classList.add('hidden');
    }

    // Inaccuracies
    const inaccuracySection = document.getElementById('inaccuracy-section');
    const inaccuracyPoints = document.getElementById('inaccuracy-points');
    if (analysis.inaccuracies && analysis.inaccuracies.length > 0) {
        inaccuracySection.classList.remove('hidden');
        inaccuracyPoints.innerHTML = analysis.inaccuracies
            .map(item => `
                <div class="inaccuracy-item">
                    <div class="inaccuracy-said">❌ You said: ${escapeHtml(item.what_they_said || '')}</div>
                    <div class="inaccuracy-correction">✅ Correct: ${escapeHtml(item.correction || '')}</div>
                    <div class="inaccuracy-explanation">${escapeHtml(item.explanation || '')}</div>
                </div>
            `)
            .join('');
    } else {
        inaccuracySection.classList.add('hidden');
    }

    // Suggestions
    const suggestionsSection = document.getElementById('suggestions-section');
    const suggestionPoints = document.getElementById('suggestion-points');
    if (analysis.suggestions && analysis.suggestions.length > 0) {
        suggestionsSection.classList.remove('hidden');
        suggestionPoints.innerHTML = analysis.suggestions
            .map(suggestion => `<li>${escapeHtml(suggestion)}</li>`)
            .join('');
    } else {
        suggestionsSection.classList.add('hidden');
    }

    // Summary
    document.getElementById('summary-text').textContent = analysis.summary || 'No summary available.';
}

function viewOriginalNotes() {
    // Switch to notes view and select the section
    switchView('notes');
    if (recallState.sectionId) {
        selectSection(recallState.sectionId);
    }
}

function tryAgain() {
    // Reset and go back to setup
    recallState.sectionId = null;
    recallState.sectionTitle = '';
    recallState.analysisResult = null;

    document.getElementById('recall-setup').classList.remove('hidden');
    document.getElementById('recall-active').classList.add('hidden');
    document.getElementById('recall-results').classList.add('hidden');
}

// ========================================
// Event Listeners
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-recall-btn').addEventListener('click', startRecall);
    document.getElementById('cancel-recall-btn').addEventListener('click', cancelRecall);
    document.getElementById('submit-recall-btn').addEventListener('click', submitRecall);
    document.getElementById('view-notes-btn').addEventListener('click', viewOriginalNotes);
    document.getElementById('try-again-btn').addEventListener('click', tryAgain);
});
