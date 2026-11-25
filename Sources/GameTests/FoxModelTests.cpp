#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "o2/Assets/Assets.h"
#include "o2/Render/Meshes/SkinnedModelFormat.h"
#include "o2/Utils/FileSystem/File.h"

using namespace o2;

namespace
{
	// Loads the real Fox.glb from the project assets (glTF sample model)
	bool LoadFoxModel(SkinnedModelData& model, String& error)
	{
		InFile file(o2Assets.GetAssetsPath() + "Fox.glb");
		if (!file.IsOpened())
		{
			error = "Fox.glb is not found in assets";
			return false;
		}

		Vector<UInt8> data;
		data.Resize((int)file.GetDataSize());
		file.ReadData(data.Data(), (UInt)data.Count());

		return GlbModelFormat::Parse(data.Data(), (UInt)data.Count(), model, &error);
	}
}

TEST(FoxModel, ParsesRealGlbFile)
{
	SkinnedModelData model;
	String error;
	ASSERT_TRUE(LoadFoxModel(model, error)) << error;

	EXPECT_EQ(model.positions.Count(), 1728);
	EXPECT_EQ(model.indices.Count(), 1728); // Non-indexed model: sequential triangles
	EXPECT_EQ(model.influences.Count(), 1728);
	EXPECT_EQ(model.uvs.Count(), 1728);

	EXPECT_EQ(model.nodes.Count(), 26);
	EXPECT_EQ(model.joints.Count(), 24);
	EXPECT_EQ(model.inverseBindMatrices.Count(), 24);

	ASSERT_EQ(model.animations.Count(), 3);
	EXPECT_GE(model.FindAnimation("Survey"), 0);
	EXPECT_GE(model.FindAnimation("Walk"), 0);
	EXPECT_GE(model.FindAnimation("Run"), 0);

	for (auto& animation : model.animations)
		EXPECT_GT(animation.duration, 0.1f);
}
