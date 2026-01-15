/**
 * Quiz Module
 * Handles question generation and quiz flow
 */

// Quiz state
const quizState = {
    questions: [],
    currentIndex: 0,
    answers: [],  // User's answers
    results: [],  // Whether each answer was correct
    showingFeedback: false
};

// ========================================
// Quiz Generation
// ========================================

async function generateQuiz() {
    const sectionId = document.getElementById('quiz-section-select').value;
    const numQuestions = parseInt(document.getElementById('question-count').value);
    const questionType = document.getElementById('question-type').value;

    if (!sectionId) {
        showToast('Please select a section', 'error');
        return;
    }

    // Check LLM status
    if (!state.llmStatus?.ollama_running || !state.llmStatus?.model_available) {
        showToast('LLM is not ready. Please wait and try again.', 'error');
        return;
    }

    try {
        showLoading('Generating questions... This may take a moment.');

        // Get custom instructions
        const customInstructions = document.getElementById('custom-instructions').value;

        const questions = await api('/api/quiz/generate', {
            method: 'POST',
            body: {
                section_id: parseInt(sectionId),
                num_questions: numQuestions,
                question_type: questionType,
                custom_instructions: customInstructions
            }
        });

        hideLoading();

        if (questions.length === 0) {
            showToast('Failed to generate questions. Try again.', 'error');
            return;
        }

        // Initialize quiz state
        quizState.questions = questions;
        quizState.currentIndex = 0;
        quizState.answers = new Array(questions.length).fill(null);
        quizState.results = new Array(questions.length).fill(null);
        quizState.showingFeedback = false;

        // Switch to quiz active view
        document.getElementById('quiz-setup').classList.add('hidden');
        document.getElementById('quiz-active').classList.remove('hidden');
        document.getElementById('quiz-results').classList.add('hidden');

        renderQuestion();
        showToast(`Generated ${questions.length} questions`, 'success');
    } catch (error) {
        hideLoading();
        showToast(`Failed to generate quiz: ${error.message}`, 'error');
    }
}

// ========================================
// Question Rendering
// ========================================

function renderQuestion() {
    const question = quizState.questions[quizState.currentIndex];
    if (!question) return;

    // Update progress
    const progressText = `Question ${quizState.currentIndex + 1} of ${quizState.questions.length}`;
    document.getElementById('quiz-progress-text').textContent = progressText;

    const progressPercent = ((quizState.currentIndex + 1) / quizState.questions.length) * 100;
    document.getElementById('quiz-progress-fill').style.width = `${progressPercent}%`;

    // Render question card
    const card = document.getElementById('question-card');

    let optionsHtml = '';
    if (question.question_type === 'mcq' && question.options) {
        optionsHtml = `
            <div class="options-list">
                ${question.options.map((opt, i) => `
                    <div class="option-item ${getOptionClass(i)}" data-index="${i}">
                        ${escapeHtml(opt)}
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        const savedAnswer = quizState.answers[quizState.currentIndex] || '';
        optionsHtml = `
            <textarea class="free-response-input" 
                      placeholder="Type your answer here..."
                      ${quizState.showingFeedback ? 'disabled' : ''}>${escapeHtml(savedAnswer)}</textarea>
        `;
    }

    let feedbackHtml = '';
    if (quizState.showingFeedback && quizState.results[quizState.currentIndex] !== null) {
        const isCorrect = quizState.results[quizState.currentIndex];
        feedbackHtml = `
            <div class="answer-feedback ${isCorrect ? 'correct' : 'incorrect'}">
                <div class="feedback-header">${isCorrect ? '✅ Correct!' : '❌ Incorrect'}</div>
                <div class="feedback-answer"><strong>Answer:</strong> ${escapeHtml(question.correct_answer)}</div>
                ${question.explanation ? `<div class="feedback-explanation">${escapeHtml(question.explanation)}</div>` : ''}
            </div>
        `;
    }

    card.innerHTML = `
        <span class="question-type-badge">${question.question_type === 'mcq' ? 'Multiple Choice' : 'Free Response'}</span>
        <p class="question-text">${escapeHtml(question.question_text)}</p>
        ${optionsHtml}
        ${feedbackHtml}
    `;

    // Add event listeners
    if (question.question_type === 'mcq') {
        card.querySelectorAll('.option-item').forEach(opt => {
            if (!quizState.showingFeedback) {
                opt.addEventListener('click', () => selectOption(parseInt(opt.dataset.index)));
            }
        });
    } else {
        const textarea = card.querySelector('.free-response-input');
        if (textarea && !quizState.showingFeedback) {
            textarea.addEventListener('input', (e) => {
                quizState.answers[quizState.currentIndex] = e.target.value;
            });
        }
    }

    // Update navigation buttons
    updateNavigationButtons();
}

function getOptionClass(optionIndex) {
    const savedAnswer = quizState.answers[quizState.currentIndex];
    const question = quizState.questions[quizState.currentIndex];

    if (!quizState.showingFeedback) {
        return savedAnswer === optionIndex ? 'selected' : '';
    }

    // Showing feedback
    const correctIndex = question.options.findIndex(opt =>
        opt.toLowerCase().trim() === question.correct_answer.toLowerCase().trim()
    );

    if (optionIndex === correctIndex) {
        return 'correct';
    }
    if (savedAnswer === optionIndex && optionIndex !== correctIndex) {
        return 'incorrect';
    }
    return '';
}

function selectOption(optionIndex) {
    quizState.answers[quizState.currentIndex] = optionIndex;
    renderQuestion();
}

function updateNavigationButtons() {
    const prevBtn = document.getElementById('quiz-prev-btn');
    const nextBtn = document.getElementById('quiz-next-btn');

    prevBtn.disabled = quizState.currentIndex === 0;

    if (quizState.showingFeedback) {
        if (quizState.currentIndex === quizState.questions.length - 1) {
            nextBtn.textContent = 'View Results';
        } else {
            nextBtn.textContent = 'Next';
        }
    } else {
        nextBtn.textContent = 'Check Answer';
    }
}

// ========================================
// Quiz Navigation
// ========================================

async function handleNext() {
    if (!quizState.showingFeedback) {
        // Check current answer
        await checkCurrentAnswer();
    } else {
        // Move to next question or results
        if (quizState.currentIndex === quizState.questions.length - 1) {
            showResults();
        } else {
            quizState.currentIndex++;
            quizState.showingFeedback = false;
            renderQuestion();
        }
    }
}

function handlePrev() {
    if (quizState.currentIndex > 0) {
        quizState.currentIndex--;
        quizState.showingFeedback = quizState.results[quizState.currentIndex] !== null;
        renderQuestion();
    }
}

async function checkCurrentAnswer() {
    const question = quizState.questions[quizState.currentIndex];
    const userAnswer = quizState.answers[quizState.currentIndex];

    if (userAnswer === null || userAnswer === undefined ||
        (typeof userAnswer === 'string' && !userAnswer.trim())) {
        showToast('Please provide an answer', 'error');
        return;
    }

    let answerText = '';
    if (question.question_type === 'mcq') {
        answerText = question.options[userAnswer];
    } else {
        answerText = userAnswer;
    }

    try {
        const result = await api('/api/quiz/check', {
            method: 'POST',
            body: {
                question_id: question.id,
                user_answer: answerText
            }
        });

        quizState.results[quizState.currentIndex] = result.is_correct;
        quizState.showingFeedback = true;
        renderQuestion();
    } catch (error) {
        showToast(`Failed to check answer: ${error.message}`, 'error');
    }
}

// ========================================
// Quiz Results
// ========================================

function showResults() {
    const correctCount = quizState.results.filter(r => r === true).length;
    const totalCount = quizState.questions.length;
    const percentage = Math.round(correctCount / totalCount * 100);

    document.getElementById('quiz-active').classList.add('hidden');
    document.getElementById('quiz-results').classList.remove('hidden');

    // Update score display
    document.getElementById('score-display').innerHTML = `
        <span class="score-value">${correctCount}/${totalCount}</span>
        <span class="score-label">Correct (${percentage}%)</span>
    `;

    // Generate summary text
    let summaryText = '';
    if (percentage === 100) {
        summaryText = '🎉 Perfect score! You\'ve mastered this material!';
    } else if (percentage >= 80) {
        summaryText = '👏 Great job! You have a strong understanding of this topic.';
    } else if (percentage >= 60) {
        summaryText = '📚 Good effort! Review the incorrect answers below to improve.';
    } else if (percentage >= 40) {
        summaryText = '💪 Keep studying! Focus on the topics you missed.';
    } else {
        summaryText = '📖 Consider reviewing the notes again before retaking the quiz.';
    }
    document.getElementById('results-summary-text').textContent = summaryText;

    // Render incorrect answer review
    renderIncorrectReview();
}

function renderIncorrectReview() {
    const reviewSection = document.getElementById('review-section');
    const reviewQuestions = document.getElementById('review-questions');

    // Get incorrect questions
    const incorrectQuestions = [];
    quizState.questions.forEach((question, index) => {
        if (quizState.results[index] === false) {
            incorrectQuestions.push({
                index: index,
                question: question,
                userAnswer: quizState.answers[index]
            });
        }
    });

    if (incorrectQuestions.length === 0) {
        reviewSection.classList.add('hidden');
        return;
    }

    reviewSection.classList.remove('hidden');

    reviewQuestions.innerHTML = incorrectQuestions.map(item => {
        let userAnswerText = '';
        if (item.question.question_type === 'mcq' && item.question.options) {
            userAnswerText = item.question.options[item.userAnswer] || 'No answer';
        } else {
            userAnswerText = item.userAnswer || 'No answer';
        }

        return `
            <div class="review-question-item">
                <div class="review-question-number">Question ${item.index + 1}</div>
                <div class="review-question-text">${escapeHtml(item.question.question_text)}</div>
                <div class="review-your-answer">
                    <strong>Your Answer:</strong> ${escapeHtml(userAnswerText)}
                </div>
                <div class="review-correct-answer">
                    <strong>Correct Answer:</strong> ${escapeHtml(item.question.correct_answer)}
                </div>
                ${item.question.explanation ? `
                    <div class="review-explanation">
                        <span class="review-explanation-label">💡 Explanation</span>
                        ${escapeHtml(item.question.explanation)}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function restartQuiz() {
    // Reset state
    quizState.questions = [];
    quizState.currentIndex = 0;
    quizState.answers = [];
    quizState.results = [];
    quizState.showingFeedback = false;

    // Show setup
    document.getElementById('quiz-setup').classList.remove('hidden');
    document.getElementById('quiz-active').classList.add('hidden');
    document.getElementById('quiz-results').classList.add('hidden');
}

// ========================================
// Event Listeners
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('generate-quiz-btn').addEventListener('click', generateQuiz);
    document.getElementById('quiz-next-btn').addEventListener('click', handleNext);
    document.getElementById('quiz-prev-btn').addEventListener('click', handlePrev);
    document.getElementById('quiz-restart-btn').addEventListener('click', restartQuiz);
});
