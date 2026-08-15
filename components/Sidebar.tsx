/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useSettings, useUI } from '../lib/state';
import c from 'classnames';
import { useLiveAPIContext } from '../contexts/LiveAPIContext';
import { useAuth } from '../lib/auth';
import { useHistoryStore } from '../lib/history';
import { AVAILABLE_LANGUAGES, AVAILABLE_VOICES } from '../lib/constants';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Sidebar() {
  const { isSidebarOpen, toggleSidebar } = useUI();
  const {
    systemPrompt, voice, language1, language2, topic, autoDetect, customLanguages, medicalMode,
    setSystemPrompt, setVoice, setLanguage1, setLanguage2, setTopic, setAutoDetect, setMedicalMode
  } = useSettings();
  const { connected } = useLiveAPIContext();
  const { user, isSuperAdmin, signOut } = useAuth();
  const { history, clearHistory } = useHistoryStore();

  const handleSave = () => {
    toggleSidebar();
  };

  const handleExport = () => {
    if (history.length === 0) {
      alert("No history to export.");
      return;
    }

    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(18);
    doc.text('Dual Translator Chat History', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Exported on: ${new Date().toLocaleString()}`, 14, 30);
    doc.text('Powered by Eburon AI', 14, 36);
    
    const tableData = history.map(item => [
      new Date(item.timestamp).toLocaleString(),
      item.sourceText,
      item.translatedText
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Time', 'Source Text', 'Translation']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [68, 141, 255] },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 70 },
        2: { cellWidth: 75 }
      }
    });

    doc.save('dual_translator_history.pdf');
  };

  return (
    <aside className={c('sidebar', { open: isSidebarOpen })}>
      <div className="sidebar-header">
        <h3>Settings</h3>
        <button onClick={toggleSidebar} className="close-button">
          <span className="icon">close</span>
        </button>
      </div>
      <div className="sidebar-content">
        <div className="profile-card">
          <img
            className="profile-avatar"
            src={user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.displayName || user?.email?.split('@')[0] || 'User')}&background=6366f1&color=fff`}
            alt="Profile"
          />
          <div className="profile-info">
            <p className="profile-name">
              {user?.displayName || user?.email?.split('@')[0] || 'User'}
              {isSuperAdmin && <span className="profile-role-badge">Super Admin</span>}
            </p>
            <p className="profile-email">{user?.email}</p>
          </div>
        </div>
        <div className="sidebar-section">
          <fieldset disabled={connected}>
            <label>
              Staff Language (Language 1)
              <select
                value={language1}
                onChange={e => setLanguage1(e.target.value)}
              >
                {[...AVAILABLE_LANGUAGES.filter(l => l.value !== 'auto'), ...customLanguages].map(lang => (
                  <option key={lang.value} value={lang.value}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Guest Language (Language 2)
              <div className="flex flex-col gap-2">
                <select
                  value={language2}
                  onChange={e => setLanguage2(e.target.value)}
                  disabled={autoDetect}
                >
                  {[...AVAILABLE_LANGUAGES.filter(l => l.value !== 'auto'), ...customLanguages].map(lang => (
                    <option key={lang.value} value={lang.value}>
                      {lang.name}
                    </option>
                  ))}
                </select>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={autoDetect}
                    onChange={e => setAutoDetect(e.target.checked)}
                  />
                  Auto-detect Guest Language
                </label>
              </div>
            </label>

            <label>
              AI Voice
              <select
                value={voice}
                onChange={e => setVoice(e.target.value)}
              >
                {AVAILABLE_VOICES.map(v => (
                  <option key={v.value} value={v.value}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-2 mt-4">
              <label className="sidebar-section-title">Translation Mode</label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="mode"
                  checked={medicalMode}
                  onChange={() => setMedicalMode(true)}
                />
                Medical Terms
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="mode"
                  checked={!medicalMode}
                  onChange={() => setMedicalMode(false)}
                />
                General
              </label>
            </div>
          </fieldset>
          <button
            onClick={handleSave}
            className="save-settings-button"
            disabled={connected}
          >
            Save Settings
          </button>
        </div>
        <div className="sidebar-section history-section">
          <div className="sidebar-section-title-wrapper">
            <h4 className="sidebar-section-title">Translation History</h4>
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                className="export-history-button"
                disabled={history.length === 0}
                aria-label="Export history"
                title="Export history"
              >
                <span className="icon">download</span> Export
              </button>
              <button
                onClick={clearHistory}
                className="clear-history-button"
                disabled={history.length === 0}
                aria-label="Clear translation history"
              >
                <span className="icon">delete_sweep</span> Clear
              </button>
            </div>
          </div>
          <div className="history-list">
            {history.length > 0 ? (
              history.map(item => (
                <div key={item.id} className="history-item">
                  <div className="history-item-header">
                    <span className="history-item-time">
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="history-item-langs">
                      {item.lang1} → {item.lang2}
                    </span>
                  </div>
                  <div className="history-item-source">
                    <strong>Source:</strong> {item.sourceText}
                  </div>
                  <div className="history-item-translation">
                    <strong>Translation:</strong> {item.translatedText}
                  </div>
                </div>
              ))
            ) : (
              <p className="history-empty-placeholder">
                No history yet. Start a translation to see it here.
              </p>
            )}
          </div>
        </div>
        <div className="sidebar-footer">
          <button onClick={signOut} className="logout-button" title="Sign out">
            <span className="icon">logout</span>
            Sign Out
          </button>
          <span className="powered-by">Powered by Eburon AI</span>
        </div>
      </div>
    </aside>
  );
}