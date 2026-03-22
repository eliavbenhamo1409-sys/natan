'use client';

import React, { createContext, useContext, useRef, useCallback, useSyncExternalStore } from 'react';

export interface ProjectsCacheState {
    projects: any[];
    fetchedAt: number;
    isLoading: boolean;
    error: string | null;

    textFilter: string;
    aiResults: any[] | null;
    activeAiQuery: string;
    suggestions: string[];
    isAiSearching: boolean;

    scrollTop: number;
}

const INITIAL: ProjectsCacheState = {
    projects: [],
    fetchedAt: 0,
    isLoading: true,
    error: null,
    textFilter: '',
    aiResults: null,
    activeAiQuery: '',
    suggestions: [],
    isAiSearching: false,
    scrollTop: 0,
};

const CACHE_TTL = 5 * 60 * 1000;

type Listener = () => void;

class ProjectsStore {
    private state: ProjectsCacheState = { ...INITIAL };
    private listeners = new Set<Listener>();
    private fetchController: AbortController | null = null;

    getSnapshot = (): ProjectsCacheState => this.state;

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    private emit() {
        this.state = { ...this.state };
        this.listeners.forEach(l => l());
    }

    patch(partial: Partial<ProjectsCacheState>) {
        Object.assign(this.state, partial);
        this.emit();
    }

    get isFresh(): boolean {
        return this.state.fetchedAt > 0 && Date.now() - this.state.fetchedAt < CACHE_TTL;
    }

    get hasData(): boolean {
        return this.state.projects.length > 0;
    }

    async fetchProjects(options: { silent?: boolean; force?: boolean } = {}) {
        const { silent = false, force = false } = options;

        if (!force && this.isFresh) return;

        if (this.fetchController) this.fetchController.abort();
        this.fetchController = new AbortController();

        if (!silent && !this.hasData) {
            this.patch({ isLoading: true, error: null });
        }

        try {
            const res = await fetch('/api/projects', { signal: this.fetchController.signal });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to load');
            this.patch({
                projects: json.projects || [],
                fetchedAt: Date.now(),
                isLoading: false,
                error: null,
            });
        } catch (e: any) {
            if (e.name === 'AbortError') return;
            if (!silent) this.patch({ isLoading: false, error: e.message });
        }
    }

    addProject(project: any) {
        const exists = this.state.projects.some((p: any) => p.id === project.id);
        if (!exists) {
            this.patch({ projects: [project, ...this.state.projects] });
        }
    }

    removeProject(projectId: string) {
        this.patch({
            projects: this.state.projects.filter((p: any) => p.id !== projectId),
            aiResults: this.state.aiResults?.filter((p: any) => p.id !== projectId) ?? null,
        });
    }

    invalidate() {
        this.patch({ fetchedAt: 0 });
    }
}

const StoreContext = createContext<ProjectsStore | null>(null);

export function ProjectsCacheProvider({ children }: { children: React.ReactNode }) {
    const storeRef = useRef<ProjectsStore | null>(null);
    if (!storeRef.current) storeRef.current = new ProjectsStore();

    return (
        <StoreContext.Provider value={storeRef.current}>
            {children}
        </StoreContext.Provider>
    );
}

export function useProjectsCache() {
    const store = useContext(StoreContext);
    if (!store) throw new Error('useProjectsCache must be used within ProjectsCacheProvider');

    const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

    const fetchProjects = useCallback(
        (opts?: { silent?: boolean; force?: boolean }) => store.fetchProjects(opts),
        [store],
    );
    const addProject = useCallback((p: any) => store.addProject(p), [store]);
    const removeProject = useCallback((id: string) => store.removeProject(id), [store]);
    const invalidate = useCallback(() => store.invalidate(), [store]);
    const patch = useCallback((p: Partial<ProjectsCacheState>) => store.patch(p), [store]);

    return { ...state, fetchProjects, addProject, removeProject, invalidate, patch, isFresh: store.isFresh };
}
