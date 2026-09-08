cmake_minimum_required(VERSION 3.22.1)
project(edge_translator LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

option(EDGE_WITH_WHISPER "whisper.cpp is linked into the runtime" OFF)
option(EDGE_WITH_LLAMA "llama.cpp is linked into the runtime" OFF)
option(EDGE_WITH_SHERPA_ONNX "sherpa-onnx is linked into the runtime" OFF)
option(EDGE_WITH_SILERO_VAD "Silero VAD ONNX runtime is linked" OFF)
option(EDGE_PIPELINE_IMPLEMENTED "The complete local capture->VAD->STT->LLM->TTS pipeline is implemented" OFF)
set(EDGE_NATIVE_REVISION "contract-v2" CACHE STRING "Native runtime revision string")

add_library(
    edge_translator
    SHARED
    cpp/edge_translator_jni.cpp
)

target_compile_definitions(
    edge_translator
    PRIVATE
    EDGE_WITH_WHISPER=$<BOOL:${EDGE_WITH_WHISPER}>
    EDGE_WITH_LLAMA=$<BOOL:${EDGE_WITH_LLAMA}>
    EDGE_WITH_SHERPA_ONNX=$<BOOL:${EDGE_WITH_SHERPA_ONNX}>
    EDGE_WITH_SILERO_VAD=$<BOOL:${EDGE_WITH_SILERO_VAD}>
    EDGE_PIPELINE_IMPLEMENTED=$<BOOL:${EDGE_PIPELINE_IMPLEMENTED}>
    EDGE_NATIVE_REVISION="${EDGE_NATIVE_REVISION}"
)

target_compile_options(edge_translator PRIVATE -Wall -Wextra -Wpedantic)

find_library(log-lib log)
find_library(android-lib android)
target_link_libraries(edge_translator PRIVATE ${log-lib} ${android-lib})

# Integration rule:
# Do not flip EDGE_* options ON merely because source trees exist. Each option
# means that the corresponding runtime is linked and exercised behind this ABI.
# EDGE_PIPELINE_IMPLEMENTED must remain OFF until capture, segmentation, ASR,
# routing/translation, TTS, playback completion, cancellation, and event emission
# are all implemented and compile-tested together.
