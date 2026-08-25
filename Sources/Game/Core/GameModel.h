#pragma once

#include "o2/Scene/Components/ScriptableComponent.h"
#include "o2/Scripts/ScriptValue.h"
#include "o2/Utils/Types/Ref.h"

using namespace o2;

// ---------------------------------------------------------------------------
// Typed C++ facade over the JavaScript GameModel instance (Assets/Scripts/
// GameModel.js) that owns every game rule. Screens only read numbers and
// strings through it and forward player actions.
// ---------------------------------------------------------------------------
class GameModel: public RefCounterable
{
public:
	static constexpr const char* kScriptPath = "Scripts/GameModel.js";

public:
	explicit GameModel(const ScriptValue& instance);

	// Adds the scriptable component with the model script to the actor and wraps its instance
	static Ref<GameModel> CreateOn(const Ref<Actor>& actor);

	bool IsValid() const;
	const ScriptValue& GetInstance() const;

	template<typename _res = void, typename ... _args>
	_res Call(const char* method, _args ... args) const;

	template<typename ... _args> int GetInt(const char* method, _args ... args) const { return Call<int>(method, args ...); }
	template<typename ... _args> float GetFloat(const char* method, _args ... args) const { return Call<float>(method, args ...); }
	template<typename ... _args> bool GetBool(const char* method, _args ... args) const { return Call<bool>(method, args ...); }
	template<typename ... _args> String GetString(const char* method, _args ... args) const { return Call<String>(method, args ...); }
	template<typename ... _args> Vector<String> GetStrings(const char* method, _args ... args) const { return Call<Vector<String>>(method, args ...); }

private:
	ScriptValue mInstance;
};

template<typename _res, typename ... _args>
_res GameModel::Call(const char* method, _args ... args) const
{
	auto function = mInstance.GetProperty(method);
	return function.template Invoke<_res, _args ...>(mInstance, args ...);
}
