// SPDX-License-Identifier: MIT
// Copyright (c) 2026 EmbyTheaterEnhanced contributors.
// Independently written compatibility adapter; no ServiceStack implementation copied.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;

namespace Emby.Theater.Serialization
{
    internal static class CompatibleJsonCodec
    {
        private static readonly HostContractResolver Resolver = new HostContractResolver();

        private static Newtonsoft.Json.JsonSerializer CreateSerializer(bool tolerateMemberErrors = false)
        {
            var result = Newtonsoft.Json.JsonSerializer.Create(new JsonSerializerSettings
            {
                ContractResolver = Resolver,
                TypeNameHandling = TypeNameHandling.None,
                MetadataPropertyHandling = MetadataPropertyHandling.Ignore,
                MissingMemberHandling = MissingMemberHandling.Ignore,
                NullValueHandling = NullValueHandling.Include,
                DefaultValueHandling = DefaultValueHandling.Include,
                ObjectCreationHandling = ObjectCreationHandling.Replace,
                DateParseHandling = DateParseHandling.None,
                Culture = CultureInfo.InvariantCulture,
                Formatting = Formatting.None
            });
            result.Converters.Add(new HostDateConverter());
            result.Converters.Add(new HostEnumConverter());
            // Preserve DTO member conversion tolerance separately from the approved document policy.
            // Syntax is parsed before this handler is attached to a materialization operation.
            if (tolerateMemberErrors) result.Error += (sender, args) =>
            {
                if (args.CurrentObject != null && args.ErrorContext.Member is string &&
                    !(args.ErrorContext.Error is NotSupportedException))
                    args.ErrorContext.Handled = true;
            };
            return result;
        }

        internal static void Write(object value, TextWriter writer)
        {
            using (var json = new JsonTextWriter(writer) { CloseOutput = false, AutoCompleteOnClose = false })
            {
                CreateSerializer().Serialize(json, value, value.GetType());
                json.Flush();
            }
        }

        internal static object Read(string text, Type type)
        {
            if (string.IsNullOrEmpty(text))
                return type.IsValueType ? Activator.CreateInstance(type) : null;
            // Approved 2026-10-23: reject incomplete documents and appended content instead of
            // restoring the old default-object success. Keep parsing outside member-error handling.
            // Consumers retain their own existing logging, cache-refresh and failure boundaries.
            using (var input = new StringReader(text))
            using (var json = new JsonTextReader(input) { DateParseHandling = DateParseHandling.None })
            {
                var token = JToken.Load(json);
                while (json.Read())
                    if (json.TokenType != JsonToken.Comment)
                        throw new JsonSerializationException("Additional content after JSON document.");
                return token.ToObject(type, CreateSerializer(true));
            }
        }

        private sealed class HostContractResolver : DefaultContractResolver
        {
            protected override List<MemberInfo> GetSerializableMembers(Type objectType)
            {
                return objectType.GetProperties(BindingFlags.Instance | BindingFlags.Public)
                    .Where(p => p.GetIndexParameters().Length == 0 && p.GetGetMethod() != null)
                    .Cast<MemberInfo>().ToList();
            }

            protected override JsonArrayContract CreateArrayContract(Type objectType)
            {
                var contract = base.CreateArrayContract(objectType);
                var itemType = contract.CollectionItemType;
                // The legacy typed-POCO collection writer emits {} for a null slot.
                // It does not use that rule for object/string/scalar/dictionary slots.
                // Leave multidimensional and non-generic collections outside this fix.
                if (itemType != null && itemType != typeof(object) && !itemType.IsValueType &&
                    (!objectType.IsArray || objectType.GetArrayRank() == 1) &&
                    ResolveContract(itemType) is JsonObjectContract && contract.Converter == null)
                    contract.Converter = new HostPocoCollectionWriter(itemType);
                return contract;
            }

            protected override JsonProperty CreateProperty(MemberInfo member, MemberSerialization mode)
            {
                var property = base.CreateProperty(member, mode);
                // Model uses its own attribute, not System.Runtime.Serialization's attribute.
                if (CustomAttributeData.GetCustomAttributes(member).Any(a =>
                    a.AttributeType.Name == "IgnoreDataMemberAttribute" ||
                    a.AttributeType.Name == "JsonIgnoreAttribute"))
                    property.Ignored = true;

                var previous = property.ShouldSerialize;
                property.ShouldSerialize = value =>
                    (previous == null || previous(value)) && property.ValueProvider.GetValue(value) != null;
                return property;
            }
        }

        private sealed class HostPocoCollectionWriter : JsonConverter
        {
            private readonly Type itemType;
            internal HostPocoCollectionWriter(Type itemType) { this.itemType = itemType; }
            public override bool CanRead { get { return false; } }
            public override bool CanConvert(Type type) { return typeof(IEnumerable).IsAssignableFrom(type); }

            public override void WriteJson(JsonWriter writer, object value, Newtonsoft.Json.JsonSerializer serializer)
            {
                if (value == null) { writer.WriteNull(); return; }
                writer.WriteStartArray();
                foreach (var item in (IEnumerable)value)
                {
                    if (item == null) { writer.WriteStartObject(); writer.WriteEndObject(); }
                    else serializer.Serialize(writer, item, itemType);
                }
                writer.WriteEndArray();
            }

            public override object ReadJson(JsonReader reader, Type type, object existingValue, Newtonsoft.Json.JsonSerializer serializer)
            {
                throw new NotSupportedException("Write-only collection compatibility converter.");
            }
        }

        private sealed class HostEnumConverter : JsonConverter
        {
            public override bool CanConvert(Type type)
            {
                return (Nullable.GetUnderlyingType(type) ?? type).IsEnum;
            }

            public override void WriteJson(JsonWriter writer, object value, Newtonsoft.Json.JsonSerializer serializer)
            {
                if (value == null) { writer.WriteNull(); return; }
                var type = value.GetType();
                if (type.IsDefined(typeof(FlagsAttribute), false))
                    writer.WriteValue(Convert.ChangeType(value, Enum.GetUnderlyingType(type), CultureInfo.InvariantCulture));
                else
                    writer.WriteValue(value.ToString());
            }

            public override object ReadJson(JsonReader reader, Type type, object existingValue, Newtonsoft.Json.JsonSerializer serializer)
            {
                var underlying = Nullable.GetUnderlyingType(type);
                var enumType = underlying ?? type;
                if (reader.TokenType == JsonToken.Null)
                    return null;
                if (reader.TokenType == JsonToken.String)
                    return Enum.Parse(enumType, (string)reader.Value, true);
                if (reader.TokenType == JsonToken.Integer)
                    return Enum.ToObject(enumType, Convert.ChangeType(reader.Value, Enum.GetUnderlyingType(enumType), CultureInfo.InvariantCulture));
                throw new JsonSerializationException("Expected enum name or integer.");
            }
        }

        private sealed class HostDateConverter : JsonConverter
        {
            private static readonly DateTime Epoch = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            private static readonly Regex MicrosoftDate = new Regex(@"^/Date\((-?\d+)([+-]\d{4})?\)/$", RegexOptions.CultureInvariant);

            public override bool CanConvert(Type type)
            {
                type = Nullable.GetUnderlyingType(type) ?? type;
                return type == typeof(DateTime) || type == typeof(DateTimeOffset);
            }

            public override void WriteJson(JsonWriter writer, object value, Newtonsoft.Json.JsonSerializer serializer)
            {
                if (value == null) { writer.WriteNull(); return; }
                if (value is DateTime)
                {
                    var date = (DateTime)value;
                    if (date.Kind == DateTimeKind.Unspecified) date = DateTime.SpecifyKind(date, DateTimeKind.Utc);
                    // Existing ISO writer keeps Local offset; AlwaysUseUtc applies on reads.
                    writer.WriteValue(date.ToString("o", CultureInfo.InvariantCulture));
                }
                else writer.WriteValue(((DateTimeOffset)value).ToString("o", CultureInfo.InvariantCulture));
            }

            public override object ReadJson(JsonReader reader, Type type, object existingValue, Newtonsoft.Json.JsonSerializer serializer)
            {
                var nullable = Nullable.GetUnderlyingType(type);
                var valueType = nullable ?? type;
                if (reader.TokenType == JsonToken.Null)
                    return nullable != null ? null : Activator.CreateInstance(valueType);
                if (reader.TokenType != JsonToken.String) throw new JsonSerializationException("Expected date string.");
                var text = (string)reader.Value;
                if (string.IsNullOrEmpty(text)) return nullable != null ? null : Activator.CreateInstance(valueType);
                var match = MicrosoftDate.Match(text);
                if (match.Success)
                {
                    var utc = Epoch.AddMilliseconds(long.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture));
                    var offsetText = match.Groups[2].Value;
                    if (valueType == typeof(DateTimeOffset))
                    {
                        if (offsetText.Length == 0) return new DateTimeOffset(utc);
                        if (offsetText == "-0000") return new DateTimeOffset(utc.ToLocalTime());
                        return new DateTimeOffset(DateTime.SpecifyKind(utc, DateTimeKind.Unspecified), ParseOffset(offsetText));
                    }
                    if (offsetText.Length == 0 || offsetText == "-0000") return utc;
                    // Preserve the original host's WCF non-zero offset behavior, even when the
                    // sender offset differs from the machine zone. Do not silently modernize it.
                    return DateTime.SpecifyKind(utc.Add(ParseOffset(offsetText)), DateTimeKind.Local).ToUniversalTime();
                }
                if (valueType == typeof(DateTimeOffset))
                    return DateTimeOffset.Parse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal);
                // The legacy condensed-date branch uniquely returns Unspecified.
                if (text.Length == 8 && text.All(char.IsDigit))
                    return DateTime.ParseExact(text, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None);
                return DateTime.Parse(text, CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal);
            }

            private static TimeSpan ParseOffset(string value)
            {
                var hours = int.Parse(value.Substring(1, 2), CultureInfo.InvariantCulture);
                var minutes = int.Parse(value.Substring(3, 2), CultureInfo.InvariantCulture);
                var offset = new TimeSpan(hours, minutes, 0);
                return value[0] == '-' ? -offset : offset;
            }
        }
    }
}
