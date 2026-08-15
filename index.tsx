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

import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';

import AuthPage from './components/auth/AuthPage';
import { useAuth } from './lib/auth';

// App is lazy-loaded so the auth page never requires GEMINI_API_KEY.
const App = lazy(() => import('./App'));

function Root() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#0b0d11',
          color: '#8b96a6',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 14,
        }}
      >
        Loading Dual Translate...
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            background: '#0b0d11',
            color: '#8b96a6',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 14,
          }}
        >
          Loading Dual Translate...
        </div>
      }
    >
      <App />
    </Suspense>
  );
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
