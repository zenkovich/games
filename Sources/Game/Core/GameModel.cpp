#include "o2/stdafx.h"
#include "Core/GameModel.h"

#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/JavaScriptAsset.h"
#include "o2/Scene/Actor.h"

GameModel::GameModel(const ScriptValue& instance):
	mInstance(instance)
{}

Ref<GameModel> GameModel::CreateOn(const Ref<Actor>& actor)
{
	auto component = actor->AddComponent<ScriptableComponent>();
	component->SetScript(AssetRef<JavaScriptAsset>(String(kScriptPath)));
	return mmake<GameModel>(component->GetInstance());
}

bool GameModel::IsValid() const
{
	return mInstance.IsObject();
}

const ScriptValue& GameModel::GetInstance() const
{
	return mInstance;
}
