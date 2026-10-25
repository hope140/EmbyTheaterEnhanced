// Isolated Linux test-only interposition. Never linked into a product/helper.
#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdatomic.h>
#include <time.h>
#include <libavformat/avformat.h>
#include <libavutil/error.h>
static atomic_int fault, entered, released;
void ete_set_fault(int mode) {atomic_store(&entered, 0); atomic_store(&released, 0); atomic_store(&fault, mode);}
int ete_fault_entered(void) {return atomic_load(&entered);}
void ete_release_fault(void) {atomic_store(&released, 1);}
int av_interleaved_write_frame(AVFormatContext *ctx, AVPacket *pkt) {
    int mode = atomic_load(&fault);
    if (mode == 1) return AVERROR(EIO);
    if (mode == 5 && !atomic_exchange(&entered, 1)) {
        // Bounded even if the coordinating probe fails; never wait indefinitely.
        for (int i = 0; i < 2000 && !atomic_load(&released); i++) {
            struct timespec delay = {.tv_nsec = 1000000}; nanosleep(&delay, NULL);
        }
    }
    int (*original)(AVFormatContext *, AVPacket *) = dlsym(RTLD_NEXT, "av_interleaved_write_frame");
    return original(ctx, pkt);
}
int av_write_trailer(AVFormatContext *ctx) {
    int (*original)(AVFormatContext *) = dlsym(RTLD_NEXT, "av_write_trailer");
    int result = original(ctx); return atomic_load(&fault) == 2 ? AVERROR(EIO) : result;
}
int avio_closep(AVIOContext **ctx) {
    int (*original)(AVIOContext **) = dlsym(RTLD_NEXT, "avio_closep");
    int result = original(ctx); return atomic_load(&fault) == 3 ? AVERROR(EIO) : result;
}
