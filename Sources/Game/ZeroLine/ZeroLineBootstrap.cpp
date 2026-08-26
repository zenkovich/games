#include "o2/stdafx.h"
#include "ZeroLineBootstrap.h"

#include "ZeroLineHost.h"
#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/JavaScriptAsset.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/CameraActor.h"
#include "o2/Scene/Components/ScriptableComponent.h"
#include "o2/Scene/Scene.h"
#include "o2/Utils/FileSystem/FileSystem.h"

using namespace o2;

namespace zero_line
{
    Ref<Actor> BuildBootstrapScene()
    {
        o2Scene.AddLayer("2D");

        auto camera = mmake<CameraActor>();
        camera->SetName("ui camera");
        camera->SetLayer("2D");
        camera->drawLayers.SetLayers(Vector<String>{ "2D" });
        camera->SetFittedSize(Vec2F(kScreenWidth, kScreenHeight));
        camera->fillBackground = true;
        camera->fillColor = Color4(24, 27, 52);

        auto game = mmake<Actor>(ActorCreateMode::InScene);
        game->SetName("Game");
        game->SetLayer("2D");
        game->transform->SetSize2D(Vec2F(kScreenWidth, kScreenHeight));

        game->AddComponent<ZeroLineHost>();

        auto scriptable = game->AddComponent<ScriptableComponent>();
        scriptable->SetScript(o2Assets.GetAssetRefByType<JavaScriptAsset>(String("Scripts/ZeroLine.js")));

        return game;
    }

    void SaveBootstrapScene(const String& path)
    {
        // Freshly created actors reach the scene's root list only on the next frame's
        // added-entities pass; without it the saved scene would hold no actors at all
        o2Scene.UpdateAddedEntities();
        o2Scene.Save(path);
    }

    void SaveBootstrapSceneIfMissing()
    {
        // Only where the source assets live: a packaged build ships the built tree alone
        if (!o2FileSystem.IsFolderExist(o2Assets.GetAssetsPath()))
            return;

        auto path = o2Assets.GetAssetsPath() + "Bootstrap.scn";
        if (o2FileSystem.IsFileExist(path))
            return;

        SaveBootstrapScene(path);
    }
}
