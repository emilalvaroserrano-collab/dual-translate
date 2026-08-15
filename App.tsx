/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useEffect } from 'react';
import ControlTray from './components/console/control-tray/ControlTray';
import ErrorScreen from './components/demo/ErrorScreen';
import StreamingConsole from './components/demo/streaming-console/StreamingConsole';

import Header from './components/Header';
import Sidebar from './components/Sidebar';
import { LiveAPIProvider } from './contexts/LiveAPIContext';
import { useAuth, updateUserSettings } from './lib/auth';
import { useSettings } from './lib/state';

const API_KEY = process.env.GEMINI_API_KEY;
function MissingKeyScreen() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#0b0f1a', color: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 520 }}>
        <h2 style={{ color: '#f43f5e', margin: '0 0 8px' }}>GEMINI_API_KEY not configured</h2>
        <p style={{ margin: '0 0 4px' }}>Missing required environment variable: GEMINI_API_KEY.</p>
        <p style={{ color: '#9ca3af', margin: 0 }}>Add it to your build environment (Vercel &gt; Settings &gt; Environment Variables) and redeploy.</p>
      </div>
    </div>
  );
}

/**
 * Main application component that provides a streaming interface for Live API.
 * Manages video streaming state and provides controls for webcam/screen capture.
 */
function App() {
  const { user } = useAuth();
  if (typeof API_KEY !== 'string') {
    return <MissingKeyScreen />;
  }

  useEffect(() => {
    if (!user) return;

    const unsub = useSettings.subscribe((state, prevState) => {
      const changes: Partial<{ systemPrompt: string; voice: string }> = {};
      if (state.systemPrompt !== prevState.systemPrompt) {
        changes.systemPrompt = state.systemPrompt;
      }
      if (state.voice !== prevState.voice) {
        changes.voice = state.voice;
      }
      if (Object.keys(changes).length > 0) {
        updateUserSettings(user.id, changes);
      }
    });

    return () => unsub();
  }, [user]);

  return (
    <div className="App">
      <LiveAPIProvider apiKey={API_KEY}>
        <ErrorScreen />
        <Header />
        <Sidebar />
        <div className="streaming-console">
          <main>
            <div className="main-app-area">
              <StreamingConsole />
            </div>
            <ControlTray></ControlTray>
          </main>
        </div>
      </LiveAPIProvider>
    </div>
  );
}

export default App;