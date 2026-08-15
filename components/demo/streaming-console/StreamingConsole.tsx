
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useRef } from 'react';
import WelcomeScreen from '../welcome-screen/WelcomeScreen';
// FIX: Import LiveServerContent to correctly type the content handler.
import { Modality, LiveServerContent, Type, LiveServerToolCall } from '@google/genai';

import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import {
  useSettings,
  useLogStore,
  ConversationTurn,
} from '../../../lib/state';
import { useHistoryStore } from '../../../lib/history';
import { useAuth, updateUserConversations } from '../../../lib/auth';

export default function StreamingConsole() {
  const { client, setConfig, connected } = useLiveAPIContext();
  const { systemPrompt, voice, language1, language2 } = useSettings();
  const { addHistoryItem } = useHistoryStore();
  const { user } = useAuth();

  const turns = useLogStore(state => state.turns);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Audio intro autoplay removed

  // Set the configuration for the Live API
  useEffect(() => {
    // Using `any` for config to accommodate `speechConfig`, which is not in the
    // current TS definitions but is used in the working reference example.
    const config: any = {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voice,
          },
        },
      },
      systemInstruction: {
        parts: [
          {
            text: systemPrompt,
          },
        ],
      },
      tools: [
        {
          functionDeclarations: [
            {
              name: 'setGuestLanguage',
              description: 'Update the "LATEST PAIRED LANGUAGE" (the non-Dutch/Flemish language). Call this tool whenever you detect a new language from the OTHER group, or when the user explicitly mentions a language they want to use.',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  language: {
                    type: Type.STRING,
                    description: 'The name of the language (e.g. English, Tagalog, Spanish, French).',
                  },
                },
                required: ['language'],
              },
            }
          ]
        }
      ],
    };

    setConfig(config);
  }, [setConfig, systemPrompt, voice]);

  useEffect(() => {
    const { addTurn, updateLastTurn } = useLogStore.getState();

    const handleInputTranscription = (text: string, isFinal: boolean) => {
      const turns = useLogStore.getState().turns;
      const last = turns[turns.length - 1];
      if (last && last.role === 'user' && !last.isFinal) {
        updateLastTurn({
          text: last.text + text,
          isFinal,
        });
      } else {
        addTurn({ role: 'user', text, isFinal });
      }
    };

    const handleOutputTranscription = (text: string, isFinal: boolean) => {
      const turns = useLogStore.getState().turns;
      const last = turns[turns.length - 1];
      if (last && last.role === 'agent' && !last.isFinal) {
        updateLastTurn({
          text: last.text + text,
          isFinal,
        });
      } else {
        addTurn({ role: 'agent', text, isFinal });
      }
    };

    const handleContent = (serverContent: LiveServerContent) => {
      const text =
        serverContent.modelTurn?.parts
          ?.map((p: any) => p.text)
          .filter(Boolean)
          .join(' ') ?? '';
      const groundingChunks = serverContent.groundingMetadata?.groundingChunks;

      if (!text && !groundingChunks) return;

      const turns = useLogStore.getState().turns;
      const last = turns[turns.length - 1];

      if (last?.role === 'agent' && !last.isFinal) {
        const updatedTurn: Partial<ConversationTurn> = {};

        if (text) {
          updatedTurn.translation = (last.translation || '') + text;
        }

        if (groundingChunks) {
          updatedTurn.groundingChunks = [
            ...(last.groundingChunks || []),
            ...groundingChunks,
          ];
        }
        updateLastTurn(updatedTurn);
      } else {
        const newTurn: Omit<ConversationTurn, 'timestamp'> = { 
          role: 'agent', 
          text: '', // Let outputTranscription handle the main text if no text parts
          translation: text || undefined,
          isFinal: false, 
          groundingChunks 
        };

        addTurn(newTurn);
      }
    };

    const handleToolCall = (toolCall: LiveServerToolCall) => {
      if (toolCall.functionCalls) {
        const functionResponses = toolCall.functionCalls.map((fc) => {
          if (fc.name === 'setGuestLanguage') {
            const args = fc.args as any;
            if (args.language) {
              useSettings.getState().setLanguage2(args.language);
              useSettings.getState().setAutoDetect(false);
            }
            return {
              id: fc.id,
              name: fc.name,
              response: { result: `The LATEST PAIRED LANGUAGE successfully set to ${args.language}. All Dutch/Flemish speech will now be translated to ${args.language}, and all ${args.language} speech will be translated to Dutch/Flemish.` }
            };
          }
          return {
            id: fc.id,
            name: fc.name,
            response: { error: 'Unknown function' }
          };
        });

        client.sendToolResponse({ functionResponses });
      }
    };

    const handleTurnComplete = () => {
      const { turns, updateLastTurn } = useLogStore.getState();
      const last = turns[turns.length - 1];

      if (last && !last.isFinal) {
        updateLastTurn({ isFinal: true });
        const updatedTurns = useLogStore.getState().turns;

        if (user) {
          updateUserConversations(user.id, user.email || '', updatedTurns, { lang1: language1, lang2: language2 });
        }

        const finalAgentTurn = updatedTurns[updatedTurns.length - 1];

        if (finalAgentTurn?.role === 'agent') {
          const agentTurnIndex = updatedTurns.length - 1;
          let correspondingUserTurn = null;
          for (let i = agentTurnIndex - 1; i >= 0; i--) {
            if (updatedTurns[i].role === 'user') {
              correspondingUserTurn = updatedTurns[i];
              break;
            }
          }

          // Use the parsed translation for history
          const translatedText = finalAgentTurn.translation || finalAgentTurn.text;
          const sourceText = finalAgentTurn.transcription || correspondingUserTurn?.text || '';

          if (translatedText && sourceText) {
            addHistoryItem({
              sourceText: sourceText.trim(),
              translatedText: translatedText.trim(),
              lang1: language1,
              lang2: language2
            });
          }
        }
      }
    };

    client.on('inputTranscription', handleInputTranscription);
    client.on('outputTranscription', handleOutputTranscription);
    client.on('content', handleContent);
    client.on('toolcall', handleToolCall);
    client.on('turncomplete', handleTurnComplete);

    return () => {
      client.off('inputTranscription', handleInputTranscription);
      client.off('outputTranscription', handleOutputTranscription);
      client.off('content', handleContent);
      client.off('toolcall', handleToolCall);
      client.off('turncomplete', handleTurnComplete);
    };
  }, [client, addHistoryItem, user, language1, language2]);

  return (
    <div className="transcription-container">
      <WelcomeScreen />
    </div>
  );
}

