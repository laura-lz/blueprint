import * as fs from 'fs';
import * as path from 'path';
import { PromptCategory, CAPSULE_SUMMARY_VARIANTS, DEEP_ANALYSIS_VARIANTS } from './prompts.js';

interface FeedbackEntry {
    versionId: string;
    rating: 1 | -1;
    reason?: string;
    timestamp: number;
}

interface FeedbackState {
    activeVersions: Record<PromptCategory, string>;
    scores: Record<string, number>;
    history: FeedbackEntry[];
}

const DEFAULT_STATE: FeedbackState = {
    activeVersions: {
        capsuleSummary: "v1_balanced",
        deepAnalysis: "v1_structured"
    },
    scores: {
        "v1_balanced": 0,
        "v2_verbose": 0,
        "v3_precision": 0,
        "v1_structured": 0,
        "v2_detailed": 0
    },
    history: []
};

/**
 * Manages user feedback and prompt versioning (RLHF-imitation loop)
 */
export class FeedbackManager {
    private statePath: string;
    private state: FeedbackState;

    constructor(projectRoot: string) {
        this.statePath = path.join(projectRoot, '.nexhacks', 'feedback.json');
        this.state = this.loadState();
    }

    private loadState(): FeedbackState {
        try {
            if (fs.existsSync(this.statePath)) {
                const content = fs.readFileSync(this.statePath, 'utf-8');
                return { ...DEFAULT_STATE, ...JSON.parse(content) };
            }
        } catch (e) {
            console.error("Failed to load feedback state:", e);
        }
        return { ...DEFAULT_STATE };
    }

    private saveState() {
        try {
            const dir = path.dirname(this.statePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf-8');
        } catch (e) {
            console.error("Failed to save feedback state:", e);
        }
    }

    /**
     * Get the currently active prompt version for a category
     */
    getActiveVersion(category: PromptCategory): string {
        return this.state.activeVersions[category] || DEFAULT_STATE.activeVersions[category];
    }

    /**
     * Submit feedback for a prompt version
     */
    submitFeedback(category: PromptCategory, versionId: string, rating: 1 | -1, reason?: string) {
        // Record history
        this.state.history.push({
            versionId,
            rating,
            reason,
            timestamp: Date.now()
        });

        // Update score
        this.state.scores[versionId] = (this.state.scores[versionId] || 0) + rating;

        // If disliked, potentially switch to a different version
        if (rating === -1) {
            this.rotateVersion(category, versionId);
        }

        this.saveState();
    }

    /**
     * Switch to a different version (the one with the next highest score, or just the next in list)
     */
    private rotateVersion(category: PromptCategory, currentVersionId: string) {
        const variants = category === "capsuleSummary" ? CAPSULE_SUMMARY_VARIANTS : DEEP_ANALYSIS_VARIANTS;
        const ids = Object.keys(variants);

        // Find versions not currently disliked too much
        const candidates = ids.filter(id => id !== currentVersionId);

        if (candidates.length > 0) {
            // Pick candidate with best score
            candidates.sort((a, b) => (this.state.scores[b] || 0) - (this.state.scores[a] || 0));
            this.state.activeVersions[category] = candidates[0];
            console.log(`[RLHF] Rotated ${category} from ${currentVersionId} to ${candidates[0]} due to negative feedback.`);
        }
    }

    /**
     * Get all states (for monitoring/UI)
     */
    getState() {
        return this.state;
    }
}
