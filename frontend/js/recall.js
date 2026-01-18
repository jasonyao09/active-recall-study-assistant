/**
 * Recall Module with Multi-Section Support
 */

// Recall state
const recallState = {
    selectedSectionIds: [],
    selectedSectionTitles: [],
    isActive: false
};

// ========================================
// Recall Practice Flow
// ========================================

function startRecallPractice() {
    // Get selected sections from checklist
    const selectedIds = getSelectedSectionIds('recall-section-checklist');

    if (selectedIds.length === 0) {
        showToast('Please select at least one section', 'error');
        return;
    }

    // Check LLM status
    if (!state.llmStatus?.ollama_running || !state.llmStatus?.model_available) {
        showToast('LLM is not ready. Please wait and try again.', 'error');
        return;
    }

    recallState.selectedSectionIds = selectedIds;
    recallState.isActive = true;

    // Get section titles for display
    const titles = selectedIds.map(id => {
        const section = notesState.flatSections.find(s => s.id === id);
        return section ? section.title : 'Unknown';
    });
    recallState.selectedSectionTitles = titles;

    // Update UI
    const titleDisplay = titles.length > 2
        ? `${titles.slice(0, 2).join(', ')} and ${titles.length - 2} more`
        : titles.join(', ');
    document.getElementById('recall-section-title').textContent = titleDisplay;

    // Show recall input
    document.getElementById('recall-setup').classList.add('hidden');
    document.getElementById('recall-active').classList.remove('hidden');
    document.getElementById('recall-results').classList.add('hidden');

    // Clear previous input
    document.getElementById('recall-textarea').value = '';
    document.getElementById('recall-textarea').focus();
}

async function submitRecall() {
    const userRecall = document.getElementById('recall-textarea').value.trim();

    if (!userRecall) {
        showToast('Please write what you remember before submitting', 'error');
        return;
    }

    if (recallState.selectedSectionIds.length === 0) {
        showToast('No sections selected', 'error');
        return;
    }

    const includeSubsections = document.getElementById('recall-include-subsections').checked;

    try {
        showLoading('Analyzing your recall... This may take a moment.');

        const result = await api('/api/recall/analyze', {
            method: 'POST',
            body: {
                section_ids: recallState.selectedSectionIds,
                user_recall: userRecall,
                include_subsections: includeSubsections
            }
        });

        hideLoading();

        // Show results
        displayRecallResults(result);

    } catch (error) {
        hideLoading();
        showToast(`Analysis failed: ${error.message}`, 'error');
    }
}

function cancelRecall() {
    recallState.isActive = false;
    recallState.selectedSectionIds = [];

    document.getElementById('recall-setup').classList.remove('hidden');
    document.getElementById('recall-active').classList.add('hidden');
    document.getElementById('recall-results').classList.add('hidden');
}

// ========================================
// Results Display
// ========================================

function displayRecallResults(result) {
    // Switch to results view
    document.getElementById('recall-active').classList.add('hidden');
    document.getElementById('recall-results').classList.remove('hidden');

    const analysis = result.analysis || {};

    // Update score
    const score = analysis.score || 0;
    document.querySelector('#recall-score .score-number').textContent = score;

    // Correct points
    const correctList = document.getElementById('correct-points');
    if (analysis.correct_points && analysis.correct_points.length > 0) {
        correctList.innerHTML = analysis.correct_points.map(point =>
            `<li>${escapeHtml(point)}</li>`
        ).join('');
        document.getElementById('correct-section').classList.remove('hidden');
    } else {
        document.getElementById('correct-section').classList.add('hidden');
    }

    // Missed points
    const missedContainer = document.getElementById('missed-points');
    if (analysis.missed_points && analysis.missed_points.length > 0) {
        missedContainer.innerHTML = analysis.missed_points.map(point => {
            if (typeof point === 'object') {
                return `
                    <div class="missed-point-item">
                        <strong>${escapeHtml(point.topic || 'Topic')}</strong>
                        <p>${escapeHtml(point.explanation || '')}</p>
                    </div>
                `;
            }
            return `<div class="missed-point-item">${escapeHtml(point)}</div>`;
        }).join('');
        document.getElementById('missed-section').classList.remove('hidden');
    } else {
        document.getElementById('missed-section').classList.add('hidden');
    }

    // Inaccuracies
    const inaccuracyContainer = document.getElementById('inaccuracy-points');
    if (analysis.inaccuracies && analysis.inaccuracies.length > 0) {
        inaccuracyContainer.innerHTML = analysis.inaccuracies.map(item => {
            if (typeof item === 'object') {
                return `
                    <div class="inaccuracy-item">
                        <div class="inaccuracy-wrong">"${escapeHtml(item.what_they_said || '')}"</div>
                        <div class="inaccuracy-correction">
                            <strong>Correction:</strong> ${escapeHtml(item.correction || '')}
                        </div>
                        ${item.explanation ? `<div class="inaccuracy-explanation">${escapeHtml(item.explanation)}</div>` : ''}
                    </div>
                `;
            }
            return `<div class="inaccuracy-item">${escapeHtml(item)}</div>`;
        }).join('');
        document.getElementById('inaccuracy-section').classList.remove('hidden');
    } else {
        document.getElementById('inaccuracy-section').classList.add('hidden');
    }

    // Suggestions
    const suggestionsList = document.getElementById('suggestion-points');
    if (analysis.suggestions && analysis.suggestions.length > 0) {
        suggestionsList.innerHTML = analysis.suggestions.map(suggestion =>
            `<li>${escapeHtml(suggestion)}</li>`
        ).join('');
        document.getElementById('suggestions-section').classList.remove('hidden');
    } else {
        document.getElementById('suggestions-section').classList.add('hidden');
    }

    // Summary
    document.getElementById('summary-text').textContent = analysis.summary || 'No summary available.';
}

// ========================================
// View Original Notes
// ========================================

function viewOriginalNotes() {
    // Switch to notes view and select first selected section
    if (recallState.selectedSectionIds.length > 0) {
        switchView('notes');
        selectSection(recallState.selectedSectionIds[0]);
    }
}

function tryAgain() {
    // Reset and go back to setup
    recallState.isActive = false;

    document.getElementById('recall-setup').classList.remove('hidden');
    document.getElementById('recall-active').classList.add('hidden');
    document.getElementById('recall-results').classList.add('hidden');
}

// ========================================
// Event Listeners
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-recall-btn').addEventListener('click', startRecallPractice);
    document.getElementById('submit-recall-btn').addEventListener('click', submitRecall);
    document.getElementById('cancel-recall-btn').addEventListener('click', cancelRecall);
    document.getElementById('view-notes-btn').addEventListener('click', viewOriginalNotes);
    document.getElementById('try-again-btn').addEventListener('click', tryAgain);
});
