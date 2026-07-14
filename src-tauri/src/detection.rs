use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet, HashMap, HashSet},
    error::Error,
    fmt, fs, io,
    path::{Path, PathBuf},
};

const BUNDLED_DETECTION_MAP: &str = include_str!("../detection-map.json");
const MAX_DETECTION_DEPTH: usize = 4;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DetectionMap {
    pub(crate) version: u32,
    pub(crate) technologies: Vec<TechnologyDefinition>,
    #[serde(default)]
    pub(crate) combos: Vec<ComboDefinition>,
    #[serde(default)]
    pub(crate) profiles: Vec<ProfileDefinition>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TechnologyDefinition {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) category: String,
    pub(crate) detect: DetectionCriteria,
    #[serde(default)]
    pub(crate) skills: Vec<SkillDefinition>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DetectionCriteria {
    #[serde(default)]
    pub(crate) packages: Vec<String>,
    #[serde(default)]
    #[serde(alias = "package_patterns")]
    pub(crate) package_patterns: Vec<String>,
    #[serde(default)]
    #[serde(alias = "config_files")]
    pub(crate) config_files: Vec<String>,
    #[serde(default)]
    #[serde(alias = "file_extensions")]
    pub(crate) file_extensions: Vec<String>,
    #[serde(default)]
    #[serde(alias = "config_file_content")]
    pub(crate) config_file_content: Vec<ContentCriterion>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ContentCriterion {
    pub(crate) files: Vec<String>,
    pub(crate) patterns: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SkillDefinition {
    pub(crate) id: String,
    #[serde(alias = "source_repo")]
    pub(crate) source_repo: String,
    pub(crate) description: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ComboDefinition {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) requires: Vec<String>,
    #[serde(default)]
    pub(crate) skills: Vec<SkillDefinition>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProfileDefinition {
    pub(crate) id: String,
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) categories: Vec<String>,
    #[serde(default)]
    #[serde(alias = "file_extensions")]
    pub(crate) file_extensions: Vec<String>,
    #[serde(default)]
    pub(crate) skills: Vec<SkillDefinition>,
}

#[derive(Debug)]
pub(crate) enum DetectionMapError {
    InvalidJson(serde_json::Error),
    InvalidSchema(String),
}

impl fmt::Display for DetectionMapError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidJson(error) => {
                write!(formatter, "el mapa no contiene JSON válido: {error}")
            }
            Self::InvalidSchema(error) => {
                write!(formatter, "el mapa no cumple el esquema: {error}")
            }
        }
    }
}

impl Error for DetectionMapError {}

pub(crate) fn load_detection_map() -> Result<DetectionMap, DetectionMapError> {
    parse_detection_map(BUNDLED_DETECTION_MAP)
}

fn parse_detection_map(contents: &str) -> Result<DetectionMap, DetectionMapError> {
    let map =
        serde_json::from_str::<DetectionMap>(contents).map_err(DetectionMapError::InvalidJson)?;
    validate_detection_map(&map)?;
    Ok(map)
}

fn validate_detection_map(map: &DetectionMap) -> Result<(), DetectionMapError> {
    if map.version == 0 {
        return Err(DetectionMapError::InvalidSchema(
            "version debe ser mayor que cero".into(),
        ));
    }

    let mut technology_ids = HashSet::new();
    for technology in &map.technologies {
        validate_identifier(&technology.id, "technology id")?;
        validate_text(&technology.name, "technology name")?;
        validate_text(&technology.category, "technology category")?;
        if !technology_ids.insert(technology.id.as_str()) {
            return Err(DetectionMapError::InvalidSchema(format!(
                "technology id duplicado: {}",
                technology.id
            )));
        }
        validate_criteria(&technology.detect)?;
        validate_skills(&technology.skills)?;
    }

    let mut combo_ids = HashSet::new();
    for combo in &map.combos {
        validate_identifier(&combo.id, "combo id")?;
        validate_text(&combo.name, "combo name")?;
        if !combo_ids.insert(combo.id.as_str()) {
            return Err(DetectionMapError::InvalidSchema(format!(
                "combo id duplicado: {}",
                combo.id
            )));
        }
        if combo.requires.is_empty() {
            return Err(DetectionMapError::InvalidSchema(format!(
                "el combo {} debe requerir al menos una tecnología",
                combo.id
            )));
        }
        for required in &combo.requires {
            if !technology_ids.contains(required.as_str()) {
                return Err(DetectionMapError::InvalidSchema(format!(
                    "el combo {} requiere una tecnología desconocida: {}",
                    combo.id, required
                )));
            }
        }
        validate_skills(&combo.skills)?;
    }

    let mut profile_ids = HashSet::new();
    for profile in &map.profiles {
        validate_identifier(&profile.id, "profile id")?;
        validate_text(&profile.name, "profile name")?;
        if !profile_ids.insert(profile.id.as_str()) {
            return Err(DetectionMapError::InvalidSchema(format!(
                "profile id duplicado: {}",
                profile.id
            )));
        }
        validate_skills(&profile.skills)?;
    }

    Ok(())
}

fn validate_criteria(criteria: &DetectionCriteria) -> Result<(), DetectionMapError> {
    for value in criteria
        .packages
        .iter()
        .chain(&criteria.package_patterns)
        .chain(&criteria.config_files)
        .chain(&criteria.file_extensions)
    {
        validate_text(value, "detection criterion")?;
    }
    for criterion in &criteria.config_file_content {
        if criterion.files.is_empty() || criterion.patterns.is_empty() {
            return Err(DetectionMapError::InvalidSchema(
                "config_file_content necesita files y patterns".into(),
            ));
        }
        for file in &criterion.files {
            validate_text(file, "content criterion file")?;
        }
        for pattern in &criterion.patterns {
            validate_text(pattern, "content criterion pattern")?;
        }
    }
    Ok(())
}

fn validate_skills(skills: &[SkillDefinition]) -> Result<(), DetectionMapError> {
    let mut ids = HashSet::new();
    for skill in skills {
        validate_identifier(&skill.id, "skill id")?;
        validate_text(&skill.source_repo, "skill source repo")?;
        validate_text(&skill.description, "skill description")?;
        if skill.source_repo.chars().any(char::is_whitespace) {
            return Err(DetectionMapError::InvalidSchema(format!(
                "el repositorio de la skill {} contiene espacios",
                skill.id
            )));
        }
        if !ids.insert(skill.id.as_str()) {
            return Err(DetectionMapError::InvalidSchema(format!(
                "skill id duplicado dentro del grupo: {}",
                skill.id
            )));
        }
    }
    Ok(())
}

fn validate_identifier(value: &str, label: &str) -> Result<(), DetectionMapError> {
    let valid = !value.is_empty()
        && value.len() <= 100
        && value.chars().all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, '-' | '_')
        });
    if valid {
        Ok(())
    } else {
        Err(DetectionMapError::InvalidSchema(format!(
            "{label} inválido: {value:?}"
        )))
    }
}

fn validate_text(value: &str, label: &str) -> Result<(), DetectionMapError> {
    if value.trim().is_empty() {
        return Err(DetectionMapError::InvalidSchema(format!(
            "{label} no puede estar vacío"
        )));
    }
    Ok(())
}

#[derive(Clone, Debug, Default)]
pub(crate) struct ProjectSnapshot {
    pub(crate) packages: Vec<PackageSnapshot>,
    pub(crate) files: Vec<ProjectFile>,
    pub(crate) config_contents: HashMap<String, String>,
    // Diagnostic metadata: which pnpm workspaces contributed to this snapshot.
    // Recorded during the scan and surfaced in tests; not read by detection yet.
    #[allow(dead_code)]
    pub(crate) scanned_workspaces: Vec<String>,
    pub(crate) warnings: Vec<String>,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct PackageSnapshot {
    // Diagnostic metadata: the manifest path this dependency set came from.
    #[allow(dead_code)]
    pub(crate) relative_path: String,
    pub(crate) dependencies: BTreeSet<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ProjectFile {
    pub(crate) relative_path: String,
    pub(crate) extension: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum DetectionEvidence {
    PackageDependency { name: String },
    ConfigFilePresent { path: String },
    FileExtensionFound { ext: String, example_path: String },
    ContentMatch { file: String, pattern: String },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DetectedTechnology {
    pub(crate) tech_id: String,
    pub(crate) tech_name: String,
    pub(crate) category: String,
    pub(crate) evidence: Vec<DetectionEvidence>,
    pub(crate) has_skills: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecommendationReason {
    pub(crate) tech_name: String,
    pub(crate) evidence_text: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SkillRecommendation {
    pub(crate) skill_id: String,
    pub(crate) source_repo: String,
    pub(crate) description: String,
    pub(crate) reasons: Vec<RecommendationReason>,
    pub(crate) installed: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecommendationGroup {
    pub(crate) label: String,
    pub(crate) kind: String,
    pub(crate) skill_ids: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DetectionResult {
    pub(crate) detected: Vec<DetectedTechnology>,
    pub(crate) recommendations: Vec<SkillRecommendation>,
    pub(crate) groups: Vec<RecommendationGroup>,
    pub(crate) warnings: Vec<String>,
}

#[derive(Debug)]
pub(crate) enum SnapshotError {
    InvalidRoot(PathBuf),
    ReadRoot { path: PathBuf, source: io::Error },
}

impl fmt::Display for SnapshotError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidRoot(path) => {
                write!(
                    formatter,
                    "the path does not exist or is not a project folder: {}",
                    path.display()
                )
            }
            Self::ReadRoot { path, source } => {
                write!(
                    formatter,
                    "could not read the folder {}: {source}",
                    path.display()
                )
            }
        }
    }
}

impl Error for SnapshotError {}

#[derive(Debug, Deserialize)]
struct RawPackageManifest {
    #[serde(default)]
    dependencies: HashMap<String, Value>,
    #[serde(default, rename = "devDependencies", alias = "dev_dependencies")]
    dev_dependencies: HashMap<String, Value>,
    #[serde(default)]
    workspaces: Option<RawWorkspaces>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum RawWorkspaces {
    List(Vec<String>),
    Object { packages: Vec<String> },
}

impl RawWorkspaces {
    fn patterns(&self) -> Vec<String> {
        match self {
            Self::List(patterns) => patterns.clone(),
            Self::Object { packages } => packages.clone(),
        }
    }
}

pub(crate) fn read_project_snapshot(
    root: &Path,
    map: &DetectionMap,
) -> Result<ProjectSnapshot, SnapshotError> {
    if !root.is_dir() {
        return Err(SnapshotError::InvalidRoot(root.to_path_buf()));
    }

    let mut cache = HashMap::new();
    let mut warnings = Vec::new();
    let mut workspace_patterns = Vec::new();
    let mut packages = Vec::new();

    let root_package_path = root.join("package.json");
    if root_package_path.is_file() {
        match read_package_snapshot(root, &root_package_path, &mut cache) {
            Ok((package, patterns)) => {
                packages.push(package);
                workspace_patterns.extend(patterns);
            }
            Err(error) => warnings.push(format!(
                "Se ignoró {} porque no contiene un package.json válido: {error}",
                relative_path(root, &root_package_path)
            )),
        }
    }

    let pnpm_workspace_path = root.join("pnpm-workspace.yaml");
    if pnpm_workspace_path.is_file() {
        match read_cached(&pnpm_workspace_path, &mut cache) {
            Ok(bytes) => match String::from_utf8(bytes) {
                Ok(contents) => workspace_patterns.extend(parse_pnpm_workspace(&contents)),
                Err(_) => warnings.push(format!(
                    "Se ignoró {} porque no es texto UTF-8.",
                    relative_path(root, &pnpm_workspace_path)
                )),
            },
            Err(error) => warnings.push(format!(
                "No se pudo leer {}: {error}",
                relative_path(root, &pnpm_workspace_path)
            )),
        }
    }

    let workspace_paths = expand_workspace_patterns(root, &workspace_patterns, &mut warnings);
    for workspace_path in &workspace_paths {
        let package_path = workspace_path.join("package.json");
        if !package_path.is_file() {
            continue;
        }
        match read_package_snapshot(root, &package_path, &mut cache) {
            Ok((package, _)) => packages.push(package),
            Err(error) => warnings.push(format!(
                "Se ignoró {} porque no contiene un package.json válido: {error}",
                relative_path(root, &package_path)
            )),
        }
    }

    let mut files = Vec::new();
    walk_files(root, root, 0, &mut files, &mut warnings).map_err(|source| {
        SnapshotError::ReadRoot {
            path: root.to_path_buf(),
            source,
        }
    })?;

    let content_file_names = map
        .technologies
        .iter()
        .flat_map(|technology| &technology.detect.config_file_content)
        .flat_map(|criterion| &criterion.files)
        .map(|file| normalize_relative(file))
        .collect::<BTreeSet<_>>();
    let mut config_contents = HashMap::new();
    for file in &files {
        if !content_file_names
            .iter()
            .any(|candidate| path_matches(&file.relative_path, candidate))
        {
            continue;
        }
        let path = root.join(&file.relative_path);
        let Ok(bytes) = read_cached(&path, &mut cache) else {
            continue;
        };
        if let Ok(contents) = String::from_utf8(bytes) {
            config_contents.insert(file.relative_path.clone(), contents);
        }
    }

    let scanned_workspaces = std::iter::once(root.to_string_lossy().to_string())
        .chain(
            workspace_paths
                .iter()
                .map(|path| path.to_string_lossy().to_string()),
        )
        .collect();

    Ok(ProjectSnapshot {
        packages,
        files,
        config_contents,
        scanned_workspaces,
        warnings,
    })
}

fn read_package_snapshot(
    root: &Path,
    package_path: &Path,
    cache: &mut HashMap<PathBuf, Vec<u8>>,
) -> Result<(PackageSnapshot, Vec<String>), serde_json::Error> {
    let bytes = read_cached(package_path, cache)
        .map_err(|error| serde_json::Error::io(io::Error::other(format!("{error}"))))?;
    let manifest = serde_json::from_slice::<RawPackageManifest>(&bytes)?;
    let dependencies = manifest
        .dependencies
        .into_keys()
        .chain(manifest.dev_dependencies.into_keys())
        .collect();
    let patterns = manifest
        .workspaces
        .as_ref()
        .map(RawWorkspaces::patterns)
        .unwrap_or_default();
    Ok((
        PackageSnapshot {
            relative_path: relative_path(root, package_path),
            dependencies,
        },
        patterns,
    ))
}

fn read_cached(path: &Path, cache: &mut HashMap<PathBuf, Vec<u8>>) -> io::Result<Vec<u8>> {
    if let Some(bytes) = cache.get(path) {
        return Ok(bytes.clone());
    }
    let bytes = fs::read(path)?;
    cache.insert(path.to_path_buf(), bytes.clone());
    Ok(bytes)
}

fn parse_pnpm_workspace(contents: &str) -> Vec<String> {
    let mut patterns = Vec::new();
    let mut in_packages = false;
    for raw_line in contents.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some(rest) = line.strip_prefix("packages:") {
            in_packages = rest.trim().is_empty();
            if !in_packages {
                patterns.extend(parse_inline_list(rest));
            }
            continue;
        }
        if in_packages {
            if let Some(pattern) = line.strip_prefix('-') {
                let value = trim_yaml_value(pattern);
                if !value.is_empty() {
                    patterns.push(value);
                }
            } else if !raw_line.starts_with(char::is_whitespace) {
                in_packages = false;
            }
        }
    }
    patterns
}

fn parse_inline_list(value: &str) -> Vec<String> {
    let trimmed = value.trim().trim_start_matches('[').trim_end_matches(']');
    trimmed
        .split(',')
        .map(trim_yaml_value)
        .filter(|item| !item.is_empty())
        .collect()
}

fn trim_yaml_value(value: &str) -> String {
    value
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_string()
}

fn expand_workspace_patterns(
    root: &Path,
    patterns: &[String],
    warnings: &mut Vec<String>,
) -> Vec<PathBuf> {
    let mut paths = HashSet::new();
    for pattern in patterns {
        let normalized = normalize_relative(pattern);
        if normalized.is_empty() || normalized.starts_with('!') {
            continue;
        }
        if let Some(star) = normalized.find('*') {
            if normalized[star + 1..].contains('*') {
                warnings.push(format!(
                    "Se ignoró el patrón de workspace complejo: {pattern}"
                ));
                continue;
            }
            let prefix = normalized[..star].trim_end_matches('/');
            let base = root.join(prefix);
            let Ok(entries) = fs::read_dir(&base) else {
                continue;
            };
            for entry in entries.flatten() {
                let Ok(file_type) = entry.file_type() else {
                    continue;
                };
                if file_type.is_dir() && !file_type.is_symlink() {
                    paths.insert(entry.path());
                }
            }
        } else {
            let path = root.join(&normalized);
            if path.is_dir() {
                paths.insert(path);
            }
        }
    }
    let mut paths: Vec<_> = paths.into_iter().collect();
    paths.sort_by(|left, right| left.to_string_lossy().cmp(&right.to_string_lossy()));
    paths
}

fn walk_files(
    directory: &Path,
    root: &Path,
    depth: usize,
    files: &mut Vec<ProjectFile>,
    warnings: &mut Vec<String>,
) -> io::Result<()> {
    let entries = fs::read_dir(directory)?;
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                warnings.push(format!(
                    "No se pudo leer una entrada de {}: {error}",
                    directory.display()
                ));
                continue;
            }
        };
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) => {
                warnings.push(format!(
                    "No se pudo inspeccionar {}: {error}",
                    entry.path().display()
                ));
                continue;
            }
        };
        let path = entry.path();
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            if depth < MAX_DETECTION_DEPTH && !super::should_skip_directory(&path) {
                if let Err(error) = walk_files(&path, root, depth + 1, files, warnings) {
                    warnings.push(format!("No se pudo recorrer {}: {error}", path.display()));
                }
            }
            continue;
        }
        if file_type.is_file() {
            let relative = relative_path(root, &path);
            files.push(ProjectFile {
                extension: path.extension().and_then(|extension| {
                    extension
                        .to_str()
                        .map(|value| format!(".{value}").to_lowercase())
                }),
                relative_path: relative,
            });
        }
    }
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(())
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn normalize_relative(path: &str) -> String {
    path.trim()
        .trim_start_matches("./")
        .replace('\\', "/")
        .trim_matches('/')
        .to_string()
}

fn path_matches(path: &str, candidate: &str) -> bool {
    let candidate = normalize_relative(candidate);
    path == candidate || path.ends_with(&format!("/{candidate}"))
}

pub(crate) fn detect_project(
    snapshot: &ProjectSnapshot,
    map: &DetectionMap,
    installed_skills: &HashSet<String>,
) -> DetectionResult {
    let dependencies: BTreeSet<String> = snapshot
        .packages
        .iter()
        .flat_map(|package| package.dependencies.iter().cloned())
        .collect();
    let mut extension_cache: HashMap<BTreeSet<String>, Option<(String, String)>> = HashMap::new();
    let mut detected = Vec::new();
    let mut recommendations: BTreeMap<String, SkillRecommendation> = BTreeMap::new();
    let mut groups = Vec::new();

    for technology in &map.technologies {
        let Some(evidence) = first_evidence(
            &technology.detect,
            &dependencies,
            snapshot,
            &mut extension_cache,
        ) else {
            continue;
        };
        detected.push(DetectedTechnology {
            tech_id: technology.id.clone(),
            tech_name: technology.name.clone(),
            category: technology.category.clone(),
            evidence: vec![evidence.clone()],
            has_skills: !technology.skills.is_empty(),
        });
        let reason = RecommendationReason {
            tech_name: technology.name.clone(),
            evidence_text: evidence_text(&evidence),
        };
        let skill_ids = technology
            .skills
            .iter()
            .map(|skill| skill.id.clone())
            .collect::<Vec<_>>();
        for skill in &technology.skills {
            append_recommendation(&mut recommendations, skill, &reason, installed_skills);
        }
        if !skill_ids.is_empty() {
            groups.push(RecommendationGroup {
                label: technology.name.clone(),
                kind: "technology".into(),
                skill_ids,
            });
        }
    }

    let detected_ids: HashSet<&str> = detected.iter().map(|item| item.tech_id.as_str()).collect();
    for combo in &map.combos {
        if !combo
            .requires
            .iter()
            .all(|required| detected_ids.contains(required.as_str()))
        {
            continue;
        }
        let names = combo
            .requires
            .iter()
            .filter_map(|required| {
                detected
                    .iter()
                    .find(|item| item.tech_id == *required)
                    .map(|item| item.tech_name.as_str())
            })
            .collect::<Vec<_>>();
        let reason = RecommendationReason {
            tech_name: combo.name.clone(),
            evidence_text: format!("Detected the combination of {}.", names.join(" + ")),
        };
        let skill_ids = combo
            .skills
            .iter()
            .map(|skill| skill.id.clone())
            .collect::<Vec<_>>();
        for skill in &combo.skills {
            append_recommendation(&mut recommendations, skill, &reason, installed_skills);
        }
        if !skill_ids.is_empty() {
            groups.push(RecommendationGroup {
                label: combo.name.clone(),
                kind: "combo".into(),
                skill_ids,
            });
        }
    }

    for profile in &map.profiles {
        let category_match = detected.iter().any(|technology| {
            profile
                .categories
                .iter()
                .any(|category| category == &technology.category)
        });
        let extension_match = find_extension_hit(
            &profile.file_extensions,
            &snapshot.files,
            &mut extension_cache,
        );
        if !category_match && extension_match.is_none() {
            continue;
        }
        let evidence = if category_match {
            format!(
                "The project uses a technology in the {} category.",
                profile.categories.join(", ")
            )
        } else if let Some((extension, example_path)) = extension_match {
            format!("There are {extension} files, e.g. {example_path}.")
        } else {
            "The project content matches this profile.".into()
        };
        let reason = RecommendationReason {
            tech_name: profile.name.clone(),
            evidence_text: evidence,
        };
        let skill_ids = profile
            .skills
            .iter()
            .map(|skill| skill.id.clone())
            .collect::<Vec<_>>();
        for skill in &profile.skills {
            append_recommendation(&mut recommendations, skill, &reason, installed_skills);
        }
        if !skill_ids.is_empty() {
            groups.push(RecommendationGroup {
                label: profile.name.clone(),
                kind: "profile".into(),
                skill_ids,
            });
        }
    }

    DetectionResult {
        detected,
        recommendations: recommendations.into_values().collect(),
        groups,
        warnings: snapshot.warnings.clone(),
    }
}

fn first_evidence(
    criteria: &DetectionCriteria,
    dependencies: &BTreeSet<String>,
    snapshot: &ProjectSnapshot,
    extension_cache: &mut HashMap<BTreeSet<String>, Option<(String, String)>>,
) -> Option<DetectionEvidence> {
    if let Some(name) = criteria
        .packages
        .iter()
        .find(|package| dependencies.contains(*package))
    {
        return Some(DetectionEvidence::PackageDependency { name: name.clone() });
    }
    if let Some(name) = dependencies.iter().find(|dependency| {
        criteria
            .package_patterns
            .iter()
            .any(|pattern| package_matches_pattern(dependency, pattern))
    }) {
        return Some(DetectionEvidence::PackageDependency { name: name.clone() });
    }
    if let Some(path) = criteria.config_files.iter().find_map(|candidate| {
        snapshot
            .files
            .iter()
            .find(|file| path_matches(&file.relative_path, candidate))
    }) {
        return Some(DetectionEvidence::ConfigFilePresent {
            path: path.relative_path.clone(),
        });
    }
    if let Some((ext, example_path)) =
        find_extension_hit(&criteria.file_extensions, &snapshot.files, extension_cache)
    {
        return Some(DetectionEvidence::FileExtensionFound { ext, example_path });
    }
    for criterion in &criteria.config_file_content {
        for file in &criterion.files {
            for pattern in &criterion.patterns {
                if let Some((path, _)) = snapshot.config_contents.iter().find(|(path, contents)| {
                    path_matches(path, file)
                        && contents.to_lowercase().contains(&pattern.to_lowercase())
                }) {
                    return Some(DetectionEvidence::ContentMatch {
                        file: path.clone(),
                        pattern: pattern.clone(),
                    });
                }
            }
        }
    }
    None
}

fn find_extension_hit(
    extensions: &[String],
    files: &[ProjectFile],
    cache: &mut HashMap<BTreeSet<String>, Option<(String, String)>>,
) -> Option<(String, String)> {
    let requested: BTreeSet<String> = extensions
        .iter()
        .map(|value| normalize_extension(value))
        .collect();
    if requested.is_empty() {
        return None;
    }
    cache
        .entry(requested.clone())
        .or_insert_with(|| {
            files.iter().find_map(|file| {
                let extension = file.extension.as_ref()?;
                if requested.contains(extension) {
                    Some((extension.clone(), file.relative_path.clone()))
                } else {
                    None
                }
            })
        })
        .clone()
}

fn normalize_extension(value: &str) -> String {
    let value = value.trim().to_lowercase();
    if value.starts_with('.') {
        value
    } else {
        format!(".{value}")
    }
}

fn package_matches_pattern(package: &str, pattern: &str) -> bool {
    let pattern = pattern.trim();
    let Some(star) = pattern.find('*') else {
        return package == pattern;
    };
    package.starts_with(&pattern[..star]) && package.ends_with(&pattern[star + 1..])
}

fn evidence_text(evidence: &DetectionEvidence) -> String {
    match evidence {
        DetectionEvidence::PackageDependency { name } => {
            format!("Found in the project dependencies: {name}.")
        }
        DetectionEvidence::ConfigFilePresent { path } => {
            format!("The file {path} exists.")
        }
        DetectionEvidence::FileExtensionFound { ext, example_path } => {
            format!("There are {ext} files, e.g. {example_path}.")
        }
        DetectionEvidence::ContentMatch { file, pattern } => {
            format!("The file {file} contains \"{pattern}\".")
        }
    }
}

fn append_recommendation(
    recommendations: &mut BTreeMap<String, SkillRecommendation>,
    skill: &SkillDefinition,
    reason: &RecommendationReason,
    installed_skills: &HashSet<String>,
) {
    let recommendation =
        recommendations
            .entry(skill.id.clone())
            .or_insert_with(|| SkillRecommendation {
                skill_id: skill.id.clone(),
                source_repo: skill.source_repo.clone(),
                description: skill.description.clone(),
                reasons: Vec::new(),
                installed: installed_skills.contains(&skill.id),
            });
    if !recommendation.reasons.contains(reason) {
        recommendation.reasons.push(reason.clone());
    }
}

#[cfg(test)]
mod tests {
    use super::{
        detect_project, load_detection_map, parse_detection_map, read_project_snapshot,
        DetectionEvidence, DetectionMap, DetectionMapError,
    };
    use std::{
        collections::HashSet,
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    struct TemporaryProject {
        path: PathBuf,
    }

    impl TemporaryProject {
        fn new(label: &str) -> Self {
            let suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock should be available")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "skill-control-detection-{label}-{}-{suffix}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("temporary project should be created");
            Self { path }
        }

        fn write(&self, relative: &str, contents: &str) {
            let path = self.path.join(relative);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).expect("fixture parent should be created");
            }
            fs::write(path, contents).expect("fixture file should be written");
        }
    }

    impl Drop for TemporaryProject {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn empty_installed_set() -> HashSet<String> {
        HashSet::new()
    }

    fn detected_ids(result: &super::DetectionResult) -> HashSet<String> {
        result
            .detected
            .iter()
            .map(|technology| technology.tech_id.clone())
            .collect()
    }

    fn fastapi_map() -> DetectionMap {
        parse_detection_map(
            r#"{
              "version": 1,
              "technologies": [{
                "id": "fastapi",
                "name": "FastAPI",
                "category": "framework-backend",
                "detect": {
                  "config_file_content": [{"files":["pyproject.toml"],"patterns":["fastapi"]}]
                },
                "skills": [{"id":"fastapi-python","source_repo":"tiangolo/fastapi","description":"Patrones de FastAPI."}]
              }]
            }"#,
        )
        .expect("FastAPI fixture map should be valid")
    }

    #[test]
    fn loads_the_bundled_detection_map() {
        let map = load_detection_map().expect("bundled map should be valid");
        assert_eq!(map.version, 1);
        assert!(map.technologies.iter().any(|item| item.id == "nextjs"));
        assert!(map.combos.iter().any(|item| item.id == "nextjs-supabase"));
        assert!(map.profiles.iter().any(|item| item.id == "frontend"));
    }

    #[test]
    fn rejects_invalid_json_without_panicking() {
        let error = parse_detection_map("{").expect_err("invalid JSON should fail cleanly");
        assert!(matches!(error, DetectionMapError::InvalidJson(_)));
    }

    #[test]
    fn rejects_duplicate_technology_ids() {
        let json = r#"{
          "version": 1,
          "technologies": [
            {"id":"react","name":"React","category":"frontend","detect":{},"skills":[]},
            {"id":"react","name":"React 2","category":"frontend","detect":{},"skills":[]}
          ]
        }"#;
        let error = parse_detection_map(json).expect_err("duplicate ids should fail");
        assert!(error.to_string().contains("technology id duplicado"));
    }

    #[test]
    fn rejects_combos_that_reference_unknown_technologies() {
        let json = r#"{
          "version": 1,
          "technologies": [],
          "combos": [{"id":"bad-combo","name":"Bad","requires":["missing"],"skills":[]}]
        }"#;
        let error = parse_detection_map(json).expect_err("unknown combo requirements should fail");
        assert!(error.to_string().contains("tecnología desconocida"));
    }

    #[test]
    fn detects_next_react_and_typescript_with_package_evidence() {
        let project = TemporaryProject::new("next-app");
        project.write(
            "package.json",
            r#"{"dependencies":{"next":"15","react":"19"},"devDependencies":{"typescript":"5"}}"#,
        );
        project.write("next.config.ts", "export default {};");
        project.write("src/App.tsx", "export function App() { return null; }");

        let map = load_detection_map().expect("bundled map should be valid");
        let snapshot = read_project_snapshot(&project.path, &map).expect("snapshot should load");
        let result = detect_project(&snapshot, &map, &empty_installed_set());
        let ids = detected_ids(&result);

        assert!(ids.contains("nextjs"));
        assert!(ids.contains("react"));
        assert!(ids.contains("typescript"));
        let next = result
            .detected
            .iter()
            .find(|technology| technology.tech_id == "nextjs")
            .expect("Next.js should be detected");
        assert_eq!(
            next.evidence,
            vec![DetectionEvidence::PackageDependency {
                name: "next".into()
            }]
        );
    }

    #[test]
    fn unions_and_deduplicates_technology_detection_across_pnpm_workspaces() {
        let project = TemporaryProject::new("pnpm-monorepo");
        project.write("pnpm-workspace.yaml", "packages:\n  - packages/*\n");
        project.write(
            "packages/web/package.json",
            r#"{"dependencies":{"next":"15","react":"19"}}"#,
        );
        project.write(
            "packages/admin/package.json",
            r#"{"devDependencies":{"react":"19","typescript":"5"}}"#,
        );

        let map = load_detection_map().expect("bundled map should be valid");
        let snapshot = read_project_snapshot(&project.path, &map).expect("snapshot should load");
        let result = detect_project(&snapshot, &map, &empty_installed_set());
        let ids = detected_ids(&result);

        assert_eq!(snapshot.packages.len(), 2);
        assert_eq!(ids.len(), 3);
        assert!(ids.contains("nextjs"));
        assert!(ids.contains("react"));
        assert!(ids.contains("typescript"));
        assert_eq!(
            result
                .detected
                .iter()
                .filter(|item| item.tech_id == "react")
                .count(),
            1
        );
    }

    #[test]
    fn detects_config_content_without_package_json() {
        let project = TemporaryProject::new("fastapi-content");
        project.write(
            "pyproject.toml",
            "[project]\ndependencies = [\"fastapi\"]\n",
        );

        let map = fastapi_map();
        let snapshot = read_project_snapshot(&project.path, &map).expect("snapshot should load");
        let result = detect_project(&snapshot, &map, &empty_installed_set());
        let fastapi = result
            .detected
            .iter()
            .find(|technology| technology.tech_id == "fastapi")
            .expect("FastAPI should be detected");

        assert_eq!(
            fastapi.evidence,
            vec![DetectionEvidence::ContentMatch {
                file: "pyproject.toml".into(),
                pattern: "fastapi".into()
            }]
        );
    }

    #[test]
    fn accepts_an_empty_folder_as_a_valid_empty_report() {
        let project = TemporaryProject::new("empty");
        let map = load_detection_map().expect("bundled map should be valid");
        let snapshot = read_project_snapshot(&project.path, &map).expect("snapshot should load");
        let result = detect_project(&snapshot, &map, &empty_installed_set());

        assert!(result.detected.is_empty());
        assert!(result.recommendations.is_empty());
        assert!(result.groups.is_empty());
    }

    #[test]
    fn keeps_config_detection_when_package_json_is_malformed() {
        let project = TemporaryProject::new("malformed-package");
        project.write("package.json", "{not-json");
        project.write("next.config.ts", "export default {};");

        let map = load_detection_map().expect("bundled map should be valid");
        let snapshot = read_project_snapshot(&project.path, &map).expect("snapshot should load");
        let result = detect_project(&snapshot, &map, &empty_installed_set());

        assert!(detected_ids(&result).contains("nextjs"));
        assert!(result
            .warnings
            .iter()
            .any(|warning| warning.contains("package.json válido")));
    }

    #[test]
    fn activates_combos_only_when_all_required_technologies_are_present() {
        let project = TemporaryProject::new("combo");
        project.write(
            "package.json",
            r#"{"dependencies":{"next":"15","@supabase/supabase-js":"2"}}"#,
        );
        let map = load_detection_map().expect("bundled map should be valid");
        let snapshot = read_project_snapshot(&project.path, &map).expect("snapshot should load");
        let result = detect_project(&snapshot, &map, &empty_installed_set());

        assert!(result
            .groups
            .iter()
            .any(|group| group.kind == "combo" && group.label == "Next.js + Supabase"));

        let only_next = TemporaryProject::new("only-next");
        only_next.write("package.json", r#"{"dependencies":{"next":"15"}}"#);
        let snapshot = read_project_snapshot(&only_next.path, &map).expect("snapshot should load");
        let result = detect_project(&snapshot, &map, &empty_installed_set());
        assert!(!result.groups.iter().any(|group| group.kind == "combo"));
    }

    #[test]
    fn marks_a_recommendation_as_installed_from_the_existing_inventory() {
        let project = TemporaryProject::new("installed");
        project.write("package.json", r#"{"dependencies":{"next":"15"}}"#);
        let map = load_detection_map().expect("bundled map should be valid");
        let snapshot = read_project_snapshot(&project.path, &map).expect("snapshot should load");
        let installed = HashSet::from(["next-best-practices".to_string()]);
        let result = detect_project(&snapshot, &map, &installed);
        let recommendation = result
            .recommendations
            .iter()
            .find(|recommendation| recommendation.skill_id == "next-best-practices")
            .expect("Next.js recommendation should exist");

        assert!(recommendation.installed);
        assert!(recommendation.reasons[0]
            .evidence_text
            .contains("dependencies"));
    }

    #[test]
    fn rejects_a_file_as_a_project_root() {
        let project = TemporaryProject::new("invalid-root");
        project.write("README.md", "content");
        let map = load_detection_map().expect("bundled map should be valid");
        let error = read_project_snapshot(&project.path.join("README.md"), &map)
            .expect_err("a file cannot be a project root");

        assert!(error.to_string().contains("does not exist"));
    }
}
