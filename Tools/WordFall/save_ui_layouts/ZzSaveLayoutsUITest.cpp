#include "o2Editor/stdafx.h"
#include <gtest/gtest.h>

#include "o2/Assets/Assets.h"
#include "o2/Utils/Test/AppTestDriver.h"
#include "o2Editor/Pipeline/Nodes/UiNodes.h"
#include "o2Editor/Pipeline/PipelineUtils.h"
#include "o2Editor/Pipeline/PipelineValue.h"
#include "o2Editor/Pipeline/UiDoc/UiDocExport.h"
#include "o2Editor/Pipeline/UiDoc/UiDocJs.h"
#include "o2Editor/Pipeline/UiDoc/UiDocOps.h"
#include "o2Editor/Pipeline/UiDoc/UiKitModel.h"

using namespace o2;
using namespace Editor;

// One-off: Save to project of chosen AI UI layout nodes of a pipeline file, run with O2_SAVE_LAYOUTS=<spec.json>
// {"pipeline": "...", "kit": "<kit node's cached json>", "layouts": [{"node": "...", "name": "...", "folder": "..."}]}
TEST(ZzSaveLayouts, Run)
{
    const char* specPath = getenv("O2_SAVE_LAYOUTS");
    if (!specPath)
        GTEST_SKIP() << "O2_SAVE_LAYOUTS is not set";

    UiDoc::Json spec, pipeline;
    ASSERT_TRUE(UiDoc::Json::Parse(PipelineUtils::ReadFileBytes(specPath), spec));
    ASSERT_TRUE(UiDoc::Json::Parse(PipelineUtils::ReadFileBytes(spec.Get("pipeline")->Str()), pipeline));
    String kitJson = PipelineUtils::ReadFileBytes(spec.Get("kit")->Str());
    ASSERT_FALSE(kitJson.IsEmpty());

    printf("assets path: %s\n", o2Assets.GetAssetsPath().Data());
    if (auto work = spec.Get("work"))
        PipelineUtils::SetWorkPathOverride(work->Str());

    for (auto& item : spec.Get("layouts")->Items())
    {
        String nodeId = item.Get("node")->Str();
        const UiDoc::Json* config = nullptr;
        for (auto& node : pipeline.Get("nodes")->Items())
        {
            if (node.Get("id")->Str() == nodeId)
                config = node.Get("config");
        }
        ASSERT_TRUE(config) << nodeId.Data();

        PipelineValue kitValue = PipelineValue::Text(kitJson);
        kitValue.type = PipelinePortType::UiKit;
        Vector<PipelineValue> kits = { kitValue };

        UiDoc::UiLayoutExportRequest request;
        request.doc = UiDoc::DocAt(*config).doc;
        request.doc.name = item.Get("name")->Str();
        request.kit = PipelineUiNodes::LayoutKit(kits, *config);
        request.nodeId = nodeId;
        request.assetPath = item.Get("folder")->Str();
        request.assetsPath = o2Assets.GetAssetsPath();

        auto co = UiDoc::ExportLayout(request);
        co.Start(JobThread::Main);
        for (int i = 0; i < 60*600 && !co.IsDone(); i++)
            AppTestDriver::PumpFrames(1);
        ASSERT_TRUE(co.IsDone());
        auto res = co.GetResult();
        printf("== %s -> %s ok=%d error=%s files=%d\n", nodeId.Data(), res.prototype.Data(), (int)res.ok, res.error.Data(),
               (int)res.written.Count());
        for (auto& f : res.written)
            printf("   file %s\n", f.Data());
        for (auto& w : res.warnings)
            printf("   warning %s\n", w.Data());
        EXPECT_TRUE(res.ok);
    }
}
