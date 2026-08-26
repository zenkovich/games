#include "o2/stdafx.h"
#include "ZeroLineHost.h"

#include "GameJsBridge.h"

String ZeroLineHost::GetName()
{
	return "Zero Line host";
}

String ZeroLineHost::GetCategory()
{
	return "Game";
}

void ZeroLineHost::OnStart()
{
	zero_line::RegisterGameJsApi();
}
// --- META ---

DECLARE_CLASS(ZeroLineHost, ZeroLineHost);
// --- END META ---
