#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include <chrono>

#include "WordFallUITestSupport.h"
#include "o2/Assets/Types/VectorImageAsset.h"
#include "o2/Render/VectorRasterCache.h"
#include "o2/Render/VectorSprite.h"
#include "o2/Scene/CameraActor.h"

// Цена векторной графики главного экрана: холодный старт сцены, кадр в покое, ход с обвалом и смена масштаба
// камеры (так зумится окно сцены редактора). Меши картинок запечены сборщиком ассетов: тесселяций нет нигде;
// картинки рисуются растрами из атласа, пока растр не готов - треугольниками
class WordFallPerfUI: public WordFallUI
{
protected:
	using Clock = std::chrono::steady_clock;

	double mStartupMs = 0;
	UInt   mStartupTessellations = 0;
	double mStartupTessellationMs = 0;

	static double Ms(Clock::time_point from) { return std::chrono::duration<double, std::milli>(Clock::now() - from).count(); }

	void SetUp() override
	{
		UInt count = VectorImageAsset::GetTessellationsCount();
		double time = VectorImageAsset::GetTessellationTime();
		auto start = Clock::now();
		WordFallUI::SetUp();
		mStartupMs = Ms(start);
		mStartupTessellations = VectorImageAsset::GetTessellationsCount() - count;
		mStartupTessellationMs = (VectorImageAsset::GetTessellationTime() - time)*1000.0;
	}

	struct Frames
	{
		double total = 0, max = 0;
		int    count = 0;
		UInt   tessellations = 0;
		double tessellationMs = 0;

		double Mean() const { return count > 0 ? total/count : 0; }
	};

	Frames Pump(int frames)
	{
		Frames out;
		UInt count = VectorImageAsset::GetTessellationsCount();
		double time = VectorImageAsset::GetTessellationTime();
		for (int i = 0; i < frames; i++)
		{
			auto start = Clock::now();
			AppTestDriver::PumpFrames(1);
			double ms = Ms(start);
			out.total += ms;
			out.max = Math::Max(out.max, ms);
			out.count++;
		}
		out.tessellations = VectorImageAsset::GetTessellationsCount() - count;
		out.tessellationMs = (VectorImageAsset::GetTessellationTime() - time)*1000.0;
		return out;
	}

	static void Report(const char* what, const Frames& f)
	{
		printf("PERF %-34s frames %3d  mean %7.1f ms  max %7.1f ms  tessellations %4u (%7.1f ms)\n",
			   what, f.count, f.Mean(), f.max, f.tessellations, f.tessellationMs);
	}

	Ref<CameraActor> Camera()
	{
		for (auto& actor : o2Scene.GetRootActors())
		{
			if (auto camera = DynamicCast<CameraActor>(actor))
				return camera;
		}
		return nullptr;
	}
};

TEST_F(WordFallPerfUI, VectorScreenCost)
{
	printf("PERF startup (scene + 10 frames)       %7.1f ms  tessellations %4u (%7.1f ms)\n",
		   mStartupMs, mStartupTessellations, mStartupTessellationMs);

	auto rastersStart = Clock::now();
	int rastersFrames = 0;
	while (o2VectorRasters.GetRasterizingCount() > 0 && rastersFrames < 600)
	{
		AppTestDriver::PumpFrames(1);
		rastersFrames++;
	}

	printf("PERF rasters ready                     %7.1f ms  frames %3d  rasters %d, pages %d, usage %.2f\n",
		   Ms(rastersStart), rastersFrames, o2VectorRasters.GetRastersCount(), o2VectorRasters.GetPagesCount(),
		   o2VectorRasters.GetUsage());

	Frames idle = Pump(30);
	Report("idle", idle);
	int primitives = o2Render.GetSceneDrawnPrimitives();
	auto before = VectorSprite::GetStatistics();
	AppTestDriver::PumpFrames(1);
	auto after = VectorSprite::GetStatistics();
	printf("PERF drawn primitives per frame        %d (vector sprites: %llu drawn, %llu from rasters, %llu culled, %llu triangles)\n",
		   primitives, (unsigned long long)(after.draws - before.draws), (unsigned long long)(after.rasterDraws - before.rasterDraws),
		   (unsigned long long)(after.culledDraws - before.culledDraws), (unsigned long long)(after.drawnTriangles - before.drawnTriangles));

	PlantWord("КОТ");
	for (int i = 1; i <= 3; i++)
		ClickTile(i, 0);
	Click(AcceptPosition());
	Frames move = Pump(120);
	Report("word accepted: flights and fall", move);

	auto camera = Camera();
	ASSERT_TRUE(camera);
	Vec2F fitted(768, 1673);
	Frames zoom;
	const float steps[] = { 0.9f, 0.75f, 0.6f, 0.5f, 0.4f, 0.33f, 0.5f, 0.75f, 1.0f, 1.3f, 1.0f };
	for (float k : steps)
	{
		camera->SetFittedSize(fitted*k);
		Frames step = Pump(4);
		zoom.total += step.total;
		zoom.max = Math::Max(zoom.max, step.max);
		zoom.count += step.count;
		zoom.tessellations += step.tessellations;
		zoom.tessellationMs += step.tessellationMs;
	}
	auto s0 = VectorSprite::GetStatistics();
	Frames settle = Pump(60);
	auto s1 = VectorSprite::GetStatistics();
	Report("zoom steps (4 frames each)", zoom);
	Report("after zoom", settle);
	printf("PERF after zoom per frame: rebuilt %llu, shifted %llu, recolored %llu vertices, %llu draws\n",
		   (unsigned long long)((s1.rebuiltVertices - s0.rebuiltVertices)/60), (unsigned long long)((s1.shiftedVertices - s0.shiftedVertices)/60),
		   (unsigned long long)((s1.recoloredVertices - s0.recoloredVertices)/60), (unsigned long long)((s1.draws - s0.draws)/60));
	camera->SetFittedSize(fitted);
	Pump(10);

	EXPECT_EQ(mStartupTessellations, 0u) << "the meshes come baked with the assets";
	EXPECT_EQ(idle.tessellations + move.tessellations + zoom.tessellations + settle.tessellations, 0u)
		<< "one mesh of an image for any scale";
	EXPECT_LT(primitives, 20000) << "the vector images are drawn from their rasters";
	EXPECT_EQ(o2VectorRasters.GetRasterizingCount(), 0) << "the rasters of the screen are ready";
}
