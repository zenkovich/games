#include "o2/stdafx.h"
#include "RotatorComponent.h"

#include "o2/Scene/Actor.h"
#include "o2libs/o2libs.h"

float RotatorComponent::GetEffectiveSpeed()
{
#if defined(O2LIBS_REMOTE_CONFIG)
	if (!balanceConfig.IsEmpty() && o2libs::RemoteConfig::IsSingletonInitialzed())
	{
		// Configs change rarely (a fetch, a scheduled launch): re-read only when they did
		int revision = o2RemoteConfig.GetRevision();
		if (revision != mBalanceRevision)
		{
			mBalanceRevision = revision;
			mBalance = RotatorBalance();
			mBalance.speed = speed;
			mHasBalance = o2RemoteConfig.GetObject(balanceConfig, mBalance);
		}

		if (mHasBalance)
			return mBalance.clockwise ? -mBalance.speed : mBalance.speed;
	}
#endif

	return speed;
}

void RotatorComponent::OnUpdate(float dt)
{
	if (auto owner = GetActor())
		owner->transform->angleDegrees = owner->transform->angleDegrees.Get() + GetEffectiveSpeed()*dt;
}
// --- META ---

DECLARE_CLASS(RotatorBalance, RotatorBalance);

DECLARE_CLASS(RotatorComponent, RotatorComponent);
// --- END META ---
