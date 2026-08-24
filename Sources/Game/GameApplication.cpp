#include "o2/stdafx.h"
#include "GameApplication.h"

#include "BrainFarm/BrainFarmBootstrap.h"
#include "BrainFarm/GameJsBridge.h"
#include "o2/Render/Render.h"
#include "o2/Scene/Scene.h"
#include "o2/Utils/Debug/Debug.h"

#if defined(PLATFORM_MAC) || defined(PLATFORM_IOS)
#include <mach/mach.h>
#endif

namespace
{
	size_t ResidentMemoryMb()
	{
#if defined(PLATFORM_MAC) || defined(PLATFORM_IOS)
		mach_task_basic_info info;
		mach_msg_type_number_t count = MACH_TASK_BASIC_INFO_COUNT;
		if (task_info(mach_task_self(), MACH_TASK_BASIC_INFO, (task_info_t)&info, &count) != KERN_SUCCESS)
			return 0;

		return info.resident_size/(1024*1024);
#else
		return 0;
#endif
	}
}

GameApplication::GameApplication(RefCounter* refCounter):
	Application(refCounter)
{}

void GameApplication::OnStarted()
{
	// Portrait window emulates the mobile aspect on desktop
	o2Application.SetWindowSize(Vec2I(450, 800));

	brain_farm::RegisterGameJsApi();
	brain_farm::BuildBootstrapScene();
	brain_farm::SaveBootstrapSceneIfMissing();
}

void GameApplication::OnUpdate(float dt)
{
	o2Application.windowCaption = String("Sahur's Brain Farm") +
		"; FPS: " + (String)((int)o2Time.GetFPS());

	// Perf heartbeat in the log: catches memory growth and FPS drops in real runs
	mPerfLogTimer += dt;
	if (mPerfLogTimer >= 5.0f)
	{
		mPerfLogTimer = 0.0f;
		o2Debug.Log(String("perf: FPS ") + (String)((int)o2Time.GetFPS()) +
					", RSS " + (String)(int)ResidentMemoryMb() + " MB" +
					", draw calls " + (String)o2Render.GetDrawCallsCount() +
					", triangles " + (String)o2Render.GetDrawnPrimitives());
	}
}

void GameApplication::OnDraw()
{
	o2Render.camera = Camera::Default();
}
