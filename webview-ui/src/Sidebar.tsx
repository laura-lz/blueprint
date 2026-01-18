import React, { useState } from 'react';
import Markdown from 'react-markdown';

// --- TYPES ---
export interface SearchResult {
    id: string;
    label: string;
    lang: string;
    matchType: string; // 'name' | 'summary' | 'symbol' | 'path'
}

export interface CapsulesData {
    stats: {
        totalFiles: number;
        totalDirectories: number;
        totalEdges: number;
        externalDependencies?: string[];
        projectOverview?: string;
    };
    files: Record<string, unknown>;
    directories: Record<string, unknown>;
}

export interface SidebarProps {
    capsules: CapsulesData | null;
    onSearch: (term: string) => void;
    onToggleStructure: (show: boolean) => void;
    showStructure: boolean;
    fileTypes: Record<string, boolean>;
    toggleFileType: (type: string) => void;
    searchResults: SearchResult[];
    onClickResult: (id: string) => void;
    onHoverResult: (id: string | null) => void;
    onAddSticky: () => void;
    onRefresh: () => void;
    onSettings: () => void;
}

// --- LANG COLORS ---
export const langColors: Record<string, { bg: string; border: string; icon: string }> = {
    'react-typescript': { bg: '#1a365d', border: '#4299e1', icon: '⚛️' },
    'typescript': { bg: '#1e3a5f', border: '#3178c6', icon: '📘' },
    'javascript': { bg: '#3d3d00', border: '#f7df1e', icon: '📒' },
    'css': { bg: '#1a1a4e', border: '#264de4', icon: '🎨' },
    'json': { bg: '#1a1a1a', border: '#555', icon: '📄' },
    'markdown': { bg: '#1a2a1a', border: '#083fa1', icon: '📝' },
    'directory': { bg: '#2d1f3d', border: '#9f7aea', icon: '📁' },
    'root': { bg: '#1a3d1a', border: '#48bb78', icon: '🏠' },
    'other': { bg: '#1a1a1a', border: '#555', icon: '📄' },
};

// --- SIDEBAR COMPONENT ---
export const Sidebar: React.FC<SidebarProps> = ({
    capsules,
    onSearch,
    onToggleStructure,
    showStructure,
    fileTypes,
    toggleFileType,
    searchResults,
    onClickResult,
    onHoverResult,
    onAddSticky,
    onRefresh,
    onSettings
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

    // Debug logging
    React.useEffect(() => {
        if (capsules?.stats) {
            console.log('[Sidebar] Stats received:', capsules.stats);
            console.log('[Sidebar] Has projectOverview:', !!capsules.stats.projectOverview);
        }
    }, [capsules]);

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSearchTerm(val);
        onSearch(val);
    };

    return (
        <div style={{
            width: '280px',
            height: '100vh',
            background: '#111',
            borderRight: '1px solid #333',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 20,
            flexShrink: 0
        }}>
            {/* Header - Fixed */}
            <div style={{ padding: '16px', borderBottom: '1px solid #222', flexShrink: 0 }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#add8e6', marginBottom: '4px' }}>
                    blueprint
                </div>
                <div style={{ fontSize: '12px', color: '#666' }}>
                    {capsules?.stats.totalFiles || 0} Files • {capsules?.stats.totalEdges || 0} Connections
                </div>
            </div>

            {/* Scrollable Content Area */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>

                {/* Search Input */}
                <div style={{ padding: '16px 16px 0 16px' }}>
                    <input
                        type="text"
                        placeholder="Search files..."
                        value={searchTerm}
                        onChange={handleSearch}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', background: '#222', border: '1px solid #333', color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                    />
                </div>

                {/* Tools Section */}
                <div style={{ padding: '16px' }}>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 'bold' }}>Tools</div>

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        <button onClick={onAddSticky} style={{ flex: 1, padding: '10px', background: '#fefcbf', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                            + Note
                        </button>
                        <button onClick={onRefresh} style={{ flex: 1, padding: '10px', background: '#2d3748', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                            🔄 Refresh
                        </button>
                    </div>

                    {/* View Controls */}
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 'bold' }}>View</div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', background: '#222', padding: '8px', borderRadius: '6px' }}>
                        <span style={{ fontSize: '13px', color: '#ccc' }}>Folder Structure</span>
                        <input type="checkbox" checked={showStructure} onChange={(e) => onToggleStructure(e.target.checked)} style={{ cursor: 'pointer' }} />
                    </div>

                    {/* File Type Filters */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {Object.keys(fileTypes).map(type => (
                            <button key={type} onClick={() => toggleFileType(type)} style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '12px', border: '1px solid #333', background: fileTypes[type] ? langColors[type]?.bg || '#333' : 'transparent', color: fileTypes[type] ? '#fff' : '#555', cursor: 'pointer', opacity: fileTypes[type] ? 1 : 0.5 }}>
                                {type === 'sticky' ? 'Notes' : type}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Search Results */}
                {searchTerm && searchResults.length > 0 && (
                    <div style={{ padding: '0 16px 16px 16px' }}>
                        <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                            Results ({searchResults.length})
                        </div>
                        <div style={{ background: '#0e0e0e', borderRadius: '8px', border: '1px solid #222' }}>
                            {searchResults.slice(0, 15).map(result => (
                                <button
                                    key={result.id}
                                    onClick={() => onClickResult(result.id)}
                                    onMouseEnter={() => onHoverResult(result.id)}
                                    onMouseLeave={() => onHoverResult(null)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        width: '100%',
                                        padding: '10px 12px',
                                        background: 'transparent',
                                        border: 'none',
                                        borderBottom: '1px solid #1a1a1a',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        fontSize: '12px',
                                        transition: 'background 0.15s'
                                    }}
                                >
                                    <span style={{ opacity: 0.7 }}>{langColors[result.lang]?.icon || '📄'}</span>
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.label}</span>
                                    <span style={{ fontSize: '9px', background: '#333', padding: '2px 6px', borderRadius: '4px', color: '#888' }}>{result.matchType}</span>
                                </button>
                            ))}
                            {searchResults.length > 15 && (
                                <div style={{ padding: '8px 12px', color: '#666', fontSize: '11px', textAlign: 'center' }}>
                                    +{searchResults.length - 15} more results
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {searchTerm && searchResults.length === 0 && (
                    <div style={{ padding: '0 16px 16px 16px', color: '#666', fontSize: '12px' }}>
                        No files found matching "{searchTerm}"
                    </div>
                )}

                {/* Project Summary */}
                {capsules?.stats.projectOverview && (
                    <div style={{ padding: '16px', borderTop: '1px solid #222', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', fontWeight: 'bold' }}>
                                ✨ Summary
                            </div>
                            {!isSummaryExpanded && (
                                <button
                                    onClick={() => setIsSummaryExpanded(true)}
                                    style={{
                                        background: '#222',
                                        border: '1px solid #333',
                                        borderRadius: '4px',
                                        color: '#ccc',
                                        fontSize: '10px',
                                        cursor: 'pointer',
                                        padding: '2px 8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <span>Expand</span>
                                    <span>▼</span>
                                </button>
                            )}
                        </div>

                        <div style={{
                            fontSize: '12px',
                            color: '#ccc',
                            maxHeight: isSummaryExpanded ? 'none' : '80px',
                            overflow: 'hidden',
                            position: 'relative',
                            transition: 'max-height 0.3s ease-out'
                        }}>
                            <Markdown components={{
                                p: (props: any) => <p style={{ marginBottom: '8px', lineHeight: '1.5' }} {...props} />,
                                strong: (props: any) => <strong style={{ color: '#fff', fontWeight: '600' }} {...props} />,
                                ul: (props: any) => <ul style={{ paddingLeft: '16px', marginBottom: '8px' }} {...props} />,
                                ol: (props: any) => <ol style={{ paddingLeft: '16px', marginBottom: '8px' }} {...props} />,
                                li: (props: any) => <li style={{ marginBottom: '4px' }} {...props} />,
                                h1: (props: any) => <h1 style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '12px', marginBottom: '8px', color: '#fff' }} {...props} />,
                                h2: (props: any) => <h2 style={{ fontSize: '13px', fontWeight: 'bold', marginTop: '10px', marginBottom: '6px', color: '#eee' }} {...props} />,
                                h3: (props: any) => <h3 style={{ fontSize: '12px', fontWeight: 'bold', marginTop: '8px', marginBottom: '4px', color: '#ddd' }} {...props} />,
                            }}>
                                {capsules.stats.projectOverview}
                            </Markdown>
                            {!isSummaryExpanded && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                    height: '40px',
                                    background: 'linear-gradient(to bottom, transparent, #111)',
                                    pointerEvents: 'none'
                                }} />
                            )}
                        </div>

                        {isSummaryExpanded && (
                            <button
                                onClick={() => setIsSummaryExpanded(false)}
                                style={{
                                    marginTop: '8px',
                                    padding: '6px',
                                    width: '100%',
                                    background: '#222',
                                    border: '1px solid #333',
                                    borderRadius: '4px',
                                    color: '#ccc',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px'
                                }}
                            >
                                <span>Hide Summary</span>
                                <span>▲</span>
                            </button>
                        )}
                    </div>
                )}

                {/* Spacer */}
                <div style={{ flex: 1 }} />

                {/* External Dependencies */}
                {capsules?.stats.externalDependencies && capsules.stats.externalDependencies.length > 0 && (
                    <div style={{ padding: '16px', borderTop: '1px solid #222', background: '#0e0e0e' }}>
                        <div style={{ fontSize: '10px', color: '#555', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 'bold' }}>Dependencies</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {capsules.stats.externalDependencies.map(dep => (
                                <span key={dep} style={{ fontSize: '10px', background: '#222', padding: '2px 6px', borderRadius: '4px', color: '#aaa' }}>{dep}</span>
                            ))}
                        </div>
                    </div>
                )}

            </div>

            {/* Settings (Fixed Bottom) */}
            <div style={{ padding: '16px', borderTop: '1px solid #222', background: '#111', flexShrink: 0 }}>
                <button onClick={onSettings} style={{ width: '100%', padding: '8px', background: '#333', color: '#ccc', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                    ⚙️ Settings
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
