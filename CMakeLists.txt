cmake_minimum_required(VERSION 3.6)
project(o2Template LANGUAGES CXX)

# Common definitions
set(CMAKE_CXX_STANDARD 20)
set_property(GLOBAL PROPERTY USE_FOLDERS ON)

option(O2_WASM_EDITOR "Enables building the editor for WebAssembly" OFF)

# Per-game identity from the branch's GameInfo.json; -DGAME_* overrides it.
# Games share this repo, so a constant bundle id would make them replace each
# other on a device.
set(_game_info_file "${CMAKE_CURRENT_SOURCE_DIR}/GameInfo.json")
if(EXISTS "${_game_info_file}" AND NOT CMAKE_VERSION VERSION_LESS 3.19)
    file(READ "${_game_info_file}" _game_info_json)
    foreach(_pair "GAME_TITLE:title" "GAME_BUNDLE_ID:bundleId"
                  "GAME_VERSION:version" "GAME_BUILD_NUMBER:build")
        string(REPLACE ":" ";" _pair "${_pair}")
        list(GET _pair 0 _game_var)
        list(GET _pair 1 _game_key)
        string(JSON _game_value ERROR_VARIABLE _game_err GET "${_game_info_json}" "${_game_key}")
        if(NOT _game_err AND NOT "${_game_value}" STREQUAL "" AND NOT ${_game_var})
            set(${_game_var} "${_game_value}")
        endif()
    endforeach()
endif()

if(NOT GAME_TITLE)
    set(GAME_TITLE "o2 Template")
endif()
if(NOT GAME_BUNDLE_ID)
    set(GAME_BUNDLE_ID "com.o2.template")
endif()
if(NOT GAME_VERSION)
    set(GAME_VERSION "1.0")
endif()
if(NOT GAME_BUILD_NUMBER)
    set(GAME_BUILD_NUMBER "1")
endif()
message(STATUS "Game: ${GAME_TITLE} — ${GAME_BUNDLE_ID} ${GAME_VERSION} (${GAME_BUILD_NUMBER})")

# Empty team = unsigned build: compiles, but produces no installable .ipa.
set(IOS_DEVELOPMENT_TEAM "" CACHE STRING "Apple Developer Team ID used to sign iOS builds")
set(IOS_CODE_SIGN_STYLE "Automatic" CACHE STRING "Xcode signing style: Automatic or Manual")
set(IOS_PROVISIONING_PROFILE "" CACHE STRING "Provisioning profile name (Manual signing only)")

if(EMSCRIPTEN)
    set(O2_TESTS OFF CACHE BOOL "" FORCE)
    if(NOT O2_WASM_EDITOR)
        set(O2_EDITOR OFF CACHE BOOL "" FORCE)
    endif()
    if(CMAKE_BUILD_TYPE STREQUAL "Release")
        # Size-optimized (-Oz: like -Os with extra size passes) + LTO + WebAssembly SIMD
        add_compile_options(-Oz -flto -msimd128 -DNDEBUG)
        add_link_options(-Oz -flto -msimd128)
    elseif(CMAKE_BUILD_TYPE STREQUAL "Debug")
        # DWARF must be emitted at compile AND preserved through link
        # so Chrome's C/C++ DevTools extension can step through sources.
        add_compile_options(-O0 -g3 -fno-inline -fno-omit-frame-pointer)
        add_link_options(-O0 -g3)
    endif()
endif()

if(ANDROID)
    set(O2_TESTS OFF CACHE BOOL "" FORCE)
    set(O2_EDITOR OFF CACHE BOOL "" FORCE)

    # Size: 42.6 -> 8.9 MB. Only the JNI entries need exporting; JNIEXPORT keeps them.
    # Release only — AGP names that config RelWithDebInfo, and Debug must keep its
    # symbols and its build speed.
    option(O2_ANDROID_SIZE_OPT "Hide non-exported symbols and GC unused sections" ON)
    if(O2_ANDROID_SIZE_OPT AND NOT CMAKE_BUILD_TYPE STREQUAL "Debug")
        add_compile_options(-fvisibility=hidden -fvisibility-inlines-hidden
                            -ffunction-sections -fdata-sections
                            -Oz -g0)

        # The engine's try/catch is all in its WebAssembly-only sources.
        option(O2_ANDROID_NO_EXCEPTIONS "Compile without C++ exceptions" ON)
        # Off means no readable backtrace in native crash dumps.
        option(O2_ANDROID_UNWIND "Keep unwind tables" OFF)
        if(O2_ANDROID_NO_EXCEPTIONS)
            add_compile_options($<$<COMPILE_LANGUAGE:CXX>:-fno-exceptions>)
            add_compile_definitions(PUGIXML_NO_EXCEPTIONS)
        endif()
        if(NOT O2_ANDROID_UNWIND)
            add_compile_options(-fno-unwind-tables -fno-asynchronous-unwind-tables)
        endif()

        option(O2_ANDROID_LTO "Link with ThinLTO" ON)
        if(O2_ANDROID_LTO)
            add_compile_options(-flto=thin)
            add_link_options(-flto=thin)
        endif()

        # icf=safe, not all: delegate removal compares raw function pointers.
        # Packed relocations need API 23; minSdk here is 24.
        add_link_options(-Wl,--gc-sections -Wl,--exclude-libs,ALL -Wl,--icf=safe
                         -Wl,--pack-dyn-relocs=android)
    endif()
endif()

# Release only — the mac Debug preset is the dev/editor build and needs its
# symbols, its build speed and (for gtest) its exceptions.
if(APPLE)
    option(O2_APPLE_SIZE_OPT "Size-optimize Apple release builds" ON)
    # Off: boost::stacktrace and utf8cpp reach the PCH here and both throw, while
    # Mach-O's unwind data costs ~1 MB against 5.4 MB for ELF's .eh_frame.
    option(O2_APPLE_NO_EXCEPTIONS "Apple release without C++ exceptions" OFF)
    if(O2_APPLE_SIZE_OPT)
        add_compile_options($<$<CONFIG:Release>:-Oz>
                            $<$<CONFIG:Release>:-fvisibility=hidden>
                            $<$<CONFIG:Release>:-fvisibility-inlines-hidden>
                            $<$<CONFIG:Release>:-flto=thin>)
        # -dead_strip is ld64's --gc-sections; unwind info stays, ObjC needs it.
        add_link_options($<$<CONFIG:Release>:-flto=thin>
                         $<$<CONFIG:Release>:-Wl,-dead_strip>)
        if(O2_APPLE_NO_EXCEPTIONS)
            add_compile_options($<$<AND:$<CONFIG:Release>,$<COMPILE_LANGUAGE:CXX>>:-fno-exceptions>)
            add_compile_definitions($<$<CONFIG:Release>:PUGIXML_NO_EXCEPTIONS>)
        endif()
    endif()
endif()

option(O2_TESTS "Enables o2 tests with Google Test" ON)
set(O2_MSVC_MP_COUNT "" CACHE STRING "MSVC /MP process count; empty uses compiler default, 0 disables /MP")

if(MSVC)
    if(O2_MSVC_MP_COUNT STREQUAL "0")
        set(O2_MSVC_MP_FLAG "")
    elseif(O2_MSVC_MP_COUNT STREQUAL "")
        set(O2_MSVC_MP_FLAG "/MP")
    else()
        set(O2_MSVC_MP_FLAG "/MP${O2_MSVC_MP_COUNT}")
    endif()
endif()

if(O2_TESTS)
    enable_testing()
endif()

if(MSVC AND O2_ASAN)
    add_compile_definitions(_DISABLE_STRING_ANNOTATION _DISABLE_VECTOR_ANNOTATION _DISABLE_ITERATOR_ANNOTATION)
    add_compile_options(-fsanitize=address)
endif()

if(MSVC)
    add_compile_definitions(_HAS_ITERATOR_DEBUGGING=0)
endif()

# o2 libraries
add_subdirectory(o2)

# Vendored CDT throws and has no switch for it, so its two includers keep
# exceptions (and can't share the PCH, which is built without them).
if((ANDROID AND O2_ANDROID_NO_EXCEPTIONS AND NOT CMAKE_BUILD_TYPE STREQUAL "Debug")
   OR (APPLE AND O2_APPLE_NO_EXCEPTIONS))
    foreach(_cdt_src "Scene/Components/MeshComponent.cpp"
                     "Scene/Components/SkinningMeshComponent.cpp")
        set_property(SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/o2/Framework/Sources/o2/${_cdt_src}"
                     TARGET_DIRECTORY o2Framework
                     APPEND PROPERTY COMPILE_OPTIONS -fexceptions -funwind-tables)
        set_property(SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/o2/Framework/Sources/o2/${_cdt_src}"
                     TARGET_DIRECTORY o2Framework
                     PROPERTY SKIP_PRECOMPILE_HEADERS ON)
    endforeach()
endif()

set(BIN_OUTPUTDIR "${CMAKE_CURRENT_SOURCE_DIR}/Bin/${O2_PLATFORM}")

function(set_target_output_directories TARGET_NAME)
    set_target_properties(${TARGET_NAME} PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY ${BIN_OUTPUTDIR}
        RUNTIME_OUTPUT_DIRECTORY_DEBUG ${BIN_OUTPUTDIR}
        RUNTIME_OUTPUT_DIRECTORY_MINSIZEREL ${BIN_OUTPUTDIR}
        RUNTIME_OUTPUT_DIRECTORY_RELEASE ${BIN_OUTPUTDIR}
        RUNTIME_OUTPUT_DIRECTORY_RELWITHDEBINFO ${BIN_OUTPUTDIR}
    )
endfunction()

# Game library
add_library(GameLib STATIC)

set(GameLib_SOURCES_DIRS "Sources/Game/*.h" "Sources/Game/*.cpp")
if (APPLE)
    list(APPEND GameLib_SOURCES_DIRS "Sources/Game/*.mm" "Sources/Game/*.m")
endif()

file(GLOB_RECURSE GameLib_SOURCES ${GameLib_SOURCES_DIRS})

target_sources(GameLib PRIVATE ${GameLib_SOURCES})
target_include_directories(GameLib PUBLIC "Sources/Game")

if(ANDROID)
    # NDK lld is more aggressive than ld64 about pruning archive members even
    # when their only external symbols are referenced via extern-function
    # anchors in the aggregator TUs. Force-link to be safe.
    # Using raw -Wl,--whole-archive instead of $<LINK_LIBRARY:WHOLE_ARCHIVE,...>
    # because Android SDK-bundled CMake 3.22.1 does not know the generator expression
    # (introduced in 3.24).
    target_link_options(GameLib PUBLIC
        "-Wl,--whole-archive" "$<TARGET_FILE:o2Framework>" "-Wl,--no-whole-archive")
    target_link_libraries(GameLib PUBLIC o2Framework)
else()
    # On WebAssembly a plain archive link lets wasm-ld drop unreferenced members;
    # type registration survives because the aggregator calls every __RegisterClass__
    target_link_libraries(GameLib PUBLIC o2Framework)
endif()

if(MSVC)
    target_compile_options(GameLib PRIVATE ${O2_MSVC_MP_FLAG} "/bigobj")
else()
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} ${O2_C_FLAGS}")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} ${O2_CXX_FLAGS}")
    set(CMAKE_OBJCXX_FLAGS "${CMAKE_OBJCXX_FLAGS} ${O2_OBJCXX_FLAGS}")
endif()

# Codegen (native host-only — skip when cross-compiling to iOS / WebAssembly / Android)
if(NOT CMAKE_SYSTEM_NAME STREQUAL "iOS" AND NOT EMSCRIPTEN AND NOT ANDROID)
    add_custom_target(GameLibCodegen
                      COMMAND ${CMAKE_CURRENT_SOURCE_DIR}/o2/CodeTool/Bin/o2CodeTool
                              -project GameLib
                              -sources "${CMAKE_CURRENT_SOURCE_DIR}/Sources/Game"
                              -parent_projects "${CMAKE_CURRENT_SOURCE_DIR}/o2/Framework/Sources/o2/CodeToolCache.xml"
                      COMMENT "Run CodeTool: ${CMAKE_CURRENT_SOURCE_DIR}/o2/CodeTool/Bin/o2CodeTool "
                              "-project GameLib "
                              "-sources \"${CMAKE_CURRENT_SOURCE_DIR}/Sources/Game\" "
                              "-parent_projects \"${CMAKE_CURRENT_SOURCE_DIR}/o2/Framework/Sources/o2/CodeToolCache.xml\""
    )
    add_dependencies(GameLibCodegen o2CodeTool o2FrameworkCodegen)
    add_dependencies(GameLib o2Framework GameLibCodegen)
else()
    add_dependencies(GameLib o2Framework)
endif()

# Assets builder (not built for iOS / WebAssembly / Android - use pre-built host tools)
if(NOT CMAKE_SYSTEM_NAME STREQUAL "iOS" AND NOT EMSCRIPTEN AND NOT ANDROID)
    add_executable(AssetsBuilder)
    target_sources(AssetsBuilder PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/o2/AssetsBuildTool/Sources/o2AssetBuilder/AssetsBuilderRunner.cpp)

    target_link_libraries(AssetsBuilder
        PUBLIC
            o2AssetsBuilder
            GameLib
    )

    if(MSVC)
        target_compile_options(AssetsBuilder PRIVATE ${O2_MSVC_MP_FLAG} "/Zc:__cplusplus" "/bigobj")
    elseif (UNIX)
        target_compile_options(AssetsBuilder PRIVATE -Wno-pedantic)
    endif()

    set_target_output_directories(AssetsBuilder)

    # Build assets step
    add_custom_target(BuildAssets
        COMMAND ${BIN_OUTPUTDIR}/AssetsBuilder -platform ${O2_PLATFORM} -source "${CMAKE_CURRENT_SOURCE_DIR}/Assets/" -target "${CMAKE_CURRENT_SOURCE_DIR}/BuiltAssets/${O2_PLATFORM}/Data/" -target-tree "${CMAKE_CURRENT_SOURCE_DIR}/BuiltAssets/${O2_PLATFORM}/Data.json" -compressor-config "${CMAKE_CURRENT_SOURCE_DIR}/o2/CompressToolsConfig.json"
        COMMENT "Build o2 assets: -platform ${O2_PLATFORM} -source \"${CMAKE_CURRENT_SOURCE_DIR}/Assets/\" -target \"${CMAKE_CURRENT_SOURCE_DIR}/BuiltAssets/${O2_PLATFORM}/Data/\" -target-tree \"${CMAKE_CURRENT_SOURCE_DIR}/BuiltAssets/${O2_PLATFORM}/Data.json\" -compressor-config \"${CMAKE_CURRENT_SOURCE_DIR}/o2/CompressToolsConfig.json\""
    )

    add_dependencies(BuildAssets o2AssetsBuilder AssetsBuilder)
else()
    # For iOS / WebAssembly, create a dummy BuildAssets target (assets should be pre-built using host tools)
    add_custom_target(BuildAssets
        COMMENT "Skipping asset build (use host tools to pre-build assets)"
    )
endif()

# Game App
if(CMAKE_SYSTEM_NAME STREQUAL "iOS")
    add_executable(Game MACOSX_BUNDLE)
elseif(ANDROID)
    # On Android the "app" is a JNI shared library loaded by a Java Activity.
    add_library(Game SHARED)
else()
    add_executable(Game)
endif()

if (APPLE)
    # PetStoryShaders is the Metal shader library target defined inside the o2 engine
    # (o2/Framework/Sources/o2/Render/{Mac,iOS}/CMakeLists.txt)
    if(CMAKE_SYSTEM_NAME STREQUAL "iOS")
        target_embed_metal_shader_libraries(Game PetStoryShaders)
        add_dependencies(Game PetStoryShaders)
    else()
        target_metal_shader_libraries(Game PetStoryShaders)
    endif()
endif()

if(CMAKE_SYSTEM_NAME STREQUAL "iOS")
    target_sources(Game PRIVATE "Platforms/iOS/Game/main.mm")

    set_target_properties(Game PROPERTIES
        MACOSX_BUNDLE TRUE
        MACOSX_BUNDLE_GUI_IDENTIFIER "${GAME_BUNDLE_ID}"
        MACOSX_BUNDLE_BUNDLE_VERSION "${GAME_VERSION}"
        MACOSX_BUNDLE_SHORT_VERSION_STRING "${GAME_VERSION}"
        MACOSX_BUNDLE_INFO_PLIST "${CMAKE_CURRENT_SOURCE_DIR}/Platforms/iOS/Game/Info.plist"
        XCODE_ATTRIBUTE_TARGETED_DEVICE_FAMILY "1,2"
        XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER "${GAME_BUNDLE_ID}"
        # Executable stays "Game"; these are what the home screen shows.
        XCODE_ATTRIBUTE_GAME_DISPLAY_NAME "${GAME_TITLE}"
        XCODE_ATTRIBUTE_MARKETING_VERSION "${GAME_VERSION}"
        XCODE_ATTRIBUTE_CURRENT_PROJECT_VERSION "${GAME_BUILD_NUMBER}"
        # Without these `xcodebuild archive` yields an empty Products/Applications.
        XCODE_ATTRIBUTE_SKIP_INSTALL "NO"
        XCODE_ATTRIBUTE_INSTALL_PATH "$(LOCAL_APPS_DIR)"
    )

    if(IOS_DEVELOPMENT_TEAM)
        set_target_properties(Game PROPERTIES
            XCODE_ATTRIBUTE_DEVELOPMENT_TEAM "${IOS_DEVELOPMENT_TEAM}"
            XCODE_ATTRIBUTE_CODE_SIGN_STYLE "${IOS_CODE_SIGN_STYLE}"
        )
        if(IOS_PROVISIONING_PROFILE)
            set_target_properties(Game PROPERTIES
                XCODE_ATTRIBUTE_PROVISIONING_PROFILE_SPECIFIER "${IOS_PROVISIONING_PROFILE}")
        endif()
    endif()

    # Add launch storyboard to the bundle
    target_sources(Game PRIVATE "Platforms/iOS/Game/Launch Screen.storyboard")
    set_source_files_properties("Platforms/iOS/Game/Launch Screen.storyboard"
        PROPERTIES MACOSX_PACKAGE_LOCATION Resources
    )

    # Copy built assets into the app bundle
    add_custom_command(TARGET Game POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_directory
            "${CMAKE_CURRENT_SOURCE_DIR}/BuiltAssets/iOS"
            "$<TARGET_BUNDLE_CONTENT_DIR:Game>"
    )
elseif (EMSCRIPTEN)
    target_sources(Game PRIVATE "Platforms/WebAssembly/main.cpp")
    set_target_properties(Game PROPERTIES SUFFIX ".html")
    target_link_options(Game PRIVATE
        "-sUSE_WEBGL2=1"
        "-sMIN_WEBGL_VERSION=2"
        "-sMAX_WEBGL_VERSION=2"
        "-sFULL_ES3=1"
        "-sALLOW_MEMORY_GROWTH=1"
        "-sINITIAL_MEMORY=128MB"
        "-sSTACK_SIZE=5MB"
        "-sEXPORTED_RUNTIME_METHODS=[ccall,cwrap,UTF8ToString]"
        "--shell-file=${CMAKE_CURRENT_SOURCE_DIR}/Platforms/WebAssembly/index.html"
        "--preload-file" "${CMAKE_CURRENT_SOURCE_DIR}/BuiltAssets/WebAssembly@/"
        "--preload-file=${CMAKE_CURRENT_SOURCE_DIR}/ProjectSettings.json@/ProjectSettings.json")

    # Preloaded assets are packed at link time: relink when the built assets tree changes.
    # Only track it when present — WebAssembly assets are pre-built by host tools, so on a
    # clean build (e.g. CI) the manifest is absent and must not become a phantom prerequisite.
    if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/BuiltAssets/WebAssembly/Data.json")
        set_property(TARGET Game APPEND PROPERTY LINK_DEPENDS
            "${CMAKE_CURRENT_SOURCE_DIR}/BuiltAssets/WebAssembly/Data.json")
    endif()
    set_property(TARGET Game APPEND PROPERTY LINK_DEPENDS
        "${CMAKE_CURRENT_SOURCE_DIR}/ProjectSettings.json")
    if(CMAKE_BUILD_TYPE STREQUAL "Debug")
        # Runtime safety + GL diagnostics + catchable C++ exceptions.
        target_link_options(Game PRIVATE
            "-gsource-map"
            "--emit-symbol-map"
            "-sASSERTIONS=2"
            "-sSAFE_HEAP=1"
            "-sSTACK_OVERFLOW_CHECK=2"
            "-sGL_ASSERTIONS=1"
            "-sGL_DEBUG=1"
            "-sDISABLE_EXCEPTION_CATCHING=0")
    else()
        # Strip node/worker glue, shrink/close JS, no runtime checks. The symbol map
        # (function index -> name, separate .js.symbols file) feeds size analysis
        # tools without adding a byte to the .wasm itself.
        target_link_options(Game PRIVATE
            "-sASSERTIONS=0"
            "-sENVIRONMENT=web"
            "-sTEXTDECODER=2"
            "-sABORTING_MALLOC=0"
            "-sFILESYSTEM=1"
            "--emit-symbol-map")
    endif()
elseif (ANDROID)
    target_sources(Game PRIVATE "Platforms/Android/app/src/main/cpp/JavaBridge.cpp")
elseif (WIN32 OR UNIX)
    target_sources(Game PRIVATE "Platforms/Windows/AppMain.cpp")
endif()

target_link_libraries(Game PUBLIC GameLib)
add_dependencies(Game GameLib BuildAssets)

set_target_output_directories(Game)

if(MSVC)
  set_property(TARGET Game PROPERTY VS_DEBUGGER_WORKING_DIRECTORY "$<TARGET_FILE_DIR:Game>")
endif()

# Editor App
if(O2_EDITOR)
    # Editor library
    add_library(EditorLib STATIC)

    file(GLOB_RECURSE EditorLib_SOURCES "Sources/Editor/*.cpp" "Sources/Editor/*.h")
    source_group(TREE ${CMAKE_CURRENT_SOURCE_DIR} FILES ${EditorLib_SOURCES})

    target_sources(EditorLib PRIVATE ${EditorLib_SOURCES})
    target_include_directories(EditorLib PUBLIC "Sources/Editor")

    target_link_libraries(EditorLib
        PUBLIC
            o2Editor
            GameLib
    )

    # Codegen (native host-only - cross-compile builds reuse committed generated sources)
    if(NOT CMAKE_SYSTEM_NAME STREQUAL "iOS" AND NOT EMSCRIPTEN AND NOT ANDROID)
        add_custom_target(EditorLibCodegen
                          COMMAND ${CMAKE_CURRENT_SOURCE_DIR}/o2/CodeTool/Bin/o2CodeTool -project EditorLib -sources "${CMAKE_CURRENT_SOURCE_DIR}/Sources/Editor" -parent_projects "${CMAKE_CURRENT_SOURCE_DIR}/o2/Framework/Sources/o2/CodeToolCache.xml ${CMAKE_CURRENT_SOURCE_DIR}/o2/Editor/Sources/o2Editor/CodeToolCache.xml ${CMAKE_CURRENT_SOURCE_DIR}/Sources/Game/CodeToolCache.xml"
                          COMMENT "Run CodeTool: ${CMAKE_CURRENT_SOURCE_DIR}/o2/CodeTool/Bin/o2CodeTool -project EditorLib -sources \"${CMAKE_CURRENT_SOURCE_DIR}/Sources/Editor\" -parent_projects \"o2Framework o2Editor GameLib caches\""
        )
        add_dependencies(EditorLibCodegen o2CodeTool o2FrameworkCodegen o2EditorCodegen GameLibCodegen)

        add_dependencies(EditorLib EditorLibCodegen)
    endif()

    add_dependencies(EditorLib GameLib o2Editor)

    if(MSVC)
        target_compile_options(EditorLib PRIVATE ${O2_MSVC_MP_FLAG} "/bigobj")
    endif()

    # build editor assets
    if(EMSCRIPTEN)
        # Editor assets are pre-built by host tools (AssetsBuilder -platform WebAssembly)
        add_custom_target(BuildEditorAssets
            COMMENT "Skipping editor asset build (use host tools to pre-build editor assets)"
        )
    else()
        add_custom_target(BuildEditorAssets
            COMMAND ${BIN_OUTPUTDIR}/AssetsBuilder -platform ${O2_PLATFORM} -source "${CMAKE_CURRENT_SOURCE_DIR}/o2/Editor/Assets/" -target "${CMAKE_CURRENT_SOURCE_DIR}/BuiltAssets/${O2_PLATFORM}/EditorData/" -target-tree "${CMAKE_CURRENT_SOURCE_DIR}/BuiltAssets/${O2_PLATFORM}/EditorData.json" -compressor-config "${CMAKE_CURRENT_SOURCE_DIR}/o2/CompressToolsConfig.json"
            COMMENT "Build o2 editor assets: -platform ${O2_PLATFORM} -source \"${CMAKE_CURRENT_SOURCE_DIR}/o2/Editor/Assets/\" -target \"${CMAKE_CURRENT_SOURCE_DIR}/BuiltAssets/${O2_PLATFORM}/EditorData/\" -target-tree \"${CMAKE_CURRENT_SOURCE_DIR}/BuiltAssets/${O2_PLATFORM}/EditorData.json\" -compressor-config \"${CMAKE_CURRENT_SOURCE_DIR}/o2/CompressToolsConfig.json\""
        )

        add_dependencies(BuildEditorAssets o2AssetsBuilder AssetsBuilder)
    endif()

    # Editor executable
    add_executable(Editor)

    if (APPLE)
        target_metal_shader_libraries(Editor PetStoryShaders)
    endif()

    if (EMSCRIPTEN)
        target_sources(Editor PRIVATE
            "Platforms/WebAssembly/editorMain.cpp"
            "Platforms/WebAssembly/editorAssetsBuild.cpp")
        # In-browser asset rebuilds: the builder library runs inside the editor
        target_link_libraries(Editor PUBLIC o2AssetsBuilder)
        set_target_properties(Editor PROPERTIES SUFFIX ".html")
        target_link_options(Editor PRIVATE
            "-sUSE_WEBGL2=1"
            "-sMIN_WEBGL_VERSION=2"
            "-sMAX_WEBGL_VERSION=2"
            "-sFULL_ES3=1"
            "-sALLOW_MEMORY_GROWTH=1"
            "-sINITIAL_MEMORY=256MB"
            "-sMAXIMUM_MEMORY=4GB"
            "-sSTACK_SIZE=5MB"
            # The project tree is streamed from the server into MEMFS at startup
            # (no --preload-file), so the JS FS API must survive DCE.
            "-sFORCE_FILESYSTEM=1"
            "-sEXPORTED_RUNTIME_METHODS=[ccall,cwrap,UTF8ToString,FS]"
            "--shell-file=${CMAKE_CURRENT_SOURCE_DIR}/Platforms/WebAssembly/editor.html")
        set_property(TARGET Editor APPEND PROPERTY LINK_DEPENDS
            "${CMAKE_CURRENT_SOURCE_DIR}/Platforms/WebAssembly/editor.html")
        if(CMAKE_BUILD_TYPE STREQUAL "Debug")
            target_link_options(Editor PRIVATE
                "-gsource-map"
                "--emit-symbol-map"
                "-sASSERTIONS=2"
                "-sSAFE_HEAP=1"
                "-sSTACK_OVERFLOW_CHECK=2"
                "-sGL_ASSERTIONS=1"
                "-sGL_DEBUG=1"
                "-sDISABLE_EXCEPTION_CATCHING=0")
        else()
            target_link_options(Editor PRIVATE
                "-sASSERTIONS=0"
                "-sENVIRONMENT=web"
                "-sTEXTDECODER=2"
                "-sABORTING_MALLOC=0"
                "-sFILESYSTEM=1"
                "--emit-symbol-map")
        endif()
    elseif (WIN32 OR UNIX)
        target_sources(Editor PRIVATE "Platforms/Windows/EditorMain.cpp")
    endif()

    target_link_libraries(Editor PUBLIC EditorLib)
    add_dependencies(Editor EditorLib BuildAssets BuildEditorAssets)

    set_target_output_directories(Editor)

    if(MSVC)
      set_property(TARGET Editor PROPERTY VS_DEBUGGER_WORKING_DIRECTORY "$<TARGET_FILE_DIR:Editor>")
    endif()

    set_target_properties(EditorLib PROPERTIES FOLDER Game)
    if(TARGET EditorLibCodegen)
        set_target_properties(EditorLibCodegen PROPERTIES FOLDER Game/Codegen)
    endif()
    set_target_properties(Editor PROPERTIES FOLDER Apps)
endif()

# Tests
if(O2_TESTS AND NOT EMSCRIPTEN AND NOT ANDROID)
    foreach(_test_target o2UtilTests o2SystemTests o2RenderTests)
        set_target_output_directories(${_test_target})
        set_target_properties(${_test_target} PROPERTIES FOLDER o2/Tests)
        add_dependencies(${_test_target} BuildAssets)
    endforeach()

    # Game component tests (links GameLib + shared o2 test support)
    include(GoogleTest)

    file(GLOB_RECURSE GameTests_SOURCES "Sources/GameTests/*.cpp")
    add_executable(GameTests ${GameTests_SOURCES})

    target_link_libraries(GameTests PRIVATE
        GTest::gtest
        o2TestsSupport
        GameLib
    )
    add_dependencies(GameTests GameLib o2TestsSupport BuildAssets)

    if(MSVC)
        target_compile_options(GameTests PRIVATE ${O2_MSVC_MP_FLAG} "/Zc:__cplusplus" "/bigobj")
    endif()

    set_target_output_directories(GameTests)
    set_target_properties(GameTests PROPERTIES FOLDER Game)

    o2_gtest_discover_tests(GameTests
        WORKING_DIRECTORY $<TARGET_FILE_DIR:GameTests>
    )

    # Game UI tests (rendered: real window, cursor injection and screenshots via AppTestDriver)
    file(GLOB_RECURSE GameUITests_SOURCES "Sources/GameUITests/*.cpp")
    add_executable(GameUITests ${GameUITests_SOURCES})

    target_link_libraries(GameUITests PRIVATE
        GTest::gtest
        o2TestsSupport
        GameLib
    )
    add_dependencies(GameUITests GameLib o2TestsSupport BuildAssets)

    if(MSVC)
        target_compile_options(GameUITests PRIVATE ${O2_MSVC_MP_FLAG} "/Zc:__cplusplus" "/bigobj")
    endif()

    set_target_output_directories(GameUITests)
    set_target_properties(GameUITests PROPERTIES FOLDER Game)

    o2_gtest_discover_tests(GameUITests
        WORKING_DIRECTORY $<TARGET_FILE_DIR:GameUITests>
    )
endif()

# Groups in IDE
set_target_properties(GameLib PROPERTIES FOLDER Game)
if(NOT CMAKE_SYSTEM_NAME STREQUAL "iOS" AND NOT EMSCRIPTEN AND NOT ANDROID)
    set_target_properties(GameLibCodegen PROPERTIES FOLDER Game/Codegen)
endif()
if(NOT CMAKE_SYSTEM_NAME STREQUAL "iOS" AND NOT EMSCRIPTEN AND NOT ANDROID)
    set_target_properties(AssetsBuilder PROPERTIES FOLDER Game/Assets)
    if(O2_EDITOR)
        set_target_properties(BuildEditorAssets PROPERTIES FOLDER Game/Assets)
    endif()
endif()
set_target_properties(BuildAssets PROPERTIES FOLDER Game/Assets)

set_target_properties(Game PROPERTIES FOLDER Apps)

# Copy LLDB formatters to binary directory for convenience (not for iOS / WebAssembly / Android)
if(NOT CMAKE_SYSTEM_NAME STREQUAL "iOS" AND NOT EMSCRIPTEN AND NOT ANDROID)
    configure_file(
        "${CMAKE_CURRENT_SOURCE_DIR}/o2/Framework/Platforms/.lldbinit"
        "${BIN_OUTPUTDIR}/.lldbinit"
        COPYONLY
    )
    configure_file(
        "${CMAKE_CURRENT_SOURCE_DIR}/o2/Framework/Platforms/o2_lldb_formatters.py"
        "${BIN_OUTPUTDIR}/o2_lldb_formatters.py"
        COPYONLY
    )
endif()

# Default startup target
set_property(DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR} PROPERTY VS_STARTUP_PROJECT Editor)
