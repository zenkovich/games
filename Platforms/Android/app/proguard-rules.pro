# Keep JNI bridge methods reachable after R8 shrinking.
-keep class com.o2.template.NativeBridge { *; }

# A native method's name is half of its JNI symbol (Java_com_o2_template_...),
# so renaming one silently breaks the link at runtime rather than at build time.
-keepclasseswithmembernames,includedescriptorclasses class * {
    native <methods>;
}
