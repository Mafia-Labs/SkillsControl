use serde::{Deserialize, Serialize};
use std::{collections::HashSet, error::Error, fmt};

const BUNDLED_DETECTION_MAP: &str = include_str!("../detection-map.json");

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

#[cfg(test)]
mod tests {
    use super::{load_detection_map, parse_detection_map, DetectionMapError};

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
}
